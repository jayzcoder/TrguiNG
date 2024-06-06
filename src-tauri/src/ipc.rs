// TrguiNG - next gen remote GUI for transmission torrent daemon
// Copyright (C) 2023  qu1ck (mail at qu1ck.org)
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

use std::error::Error;
use std::io;
use std::net::{IpAddr, TcpListener};
use std::sync::Arc;
use std::time::Duration;

use hyper::body::{to_bytes, Bytes};
use hyper::header::{
    self, HeaderValue, ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS,
    ACCESS_CONTROL_ALLOW_ORIGIN, ACCESS_CONTROL_EXPOSE_HEADERS, AUTHORIZATION, ORIGIN,
};
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Client, HeaderMap, Method, Request, Response, Server, StatusCode};
use hyper_timeout::TimeoutConnector;
use hyper_tls::HttpsConnector;
use tauri::{async_runtime, AppHandle, Manager};
use tokio::sync::{oneshot, OwnedSemaphorePermit, Semaphore};

use crate::torrentcache::process_response;
use crate::tray::toggle_main_window;

const ADDRESS: &str = "127.0.0.1:44321";
const ALLOW_ORIGINS: &[&str] = if cfg!(feature = "custom-protocol") {
    &["tauri://localhost", "https://tauri.localhost"]
} else {
    &["http://localhost:8080"]
};
const TRANSMISSION_SESSION_ID: &str = "X-Transmission-Session-Id";

#[derive(Clone, serde::Serialize)]
struct Payload(String);

fn not_found() -> Response<Body> {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body("NOT FOUND".into())
        .unwrap()
}

fn timed_out(request_headers: &HeaderMap) -> Response<Body> {
    let mut response = Response::builder()
        .status(StatusCode::REQUEST_TIMEOUT)
        .body("Request timed out".into())
        .unwrap();
    cors(request_headers, &mut response, ALLOW_ORIGINS);
    response
}

fn invalid_request(request_headers: &HeaderMap, msg: &str) -> Response<Body> {
    let mut response = Response::builder()
        .status(StatusCode::BAD_REQUEST)
        .body(format!("INVALID REQUEST: {}", msg).into())
        .unwrap();
    cors(request_headers, &mut response, ALLOW_ORIGINS);
    response
}

fn cors(request_headers: &HeaderMap, r: &mut Response<Body>, allowed_origins: &[&str]) {
    if let header::Entry::Occupied(e) = r.headers_mut().entry(ACCESS_CONTROL_ALLOW_ORIGIN) {
        e.remove_entry_mult();
    }
    if let Some(origin) = request_headers.get(ORIGIN) {
        if allowed_origins.iter().any(|o| o == origin) {
            r.headers_mut()
                .append(ACCESS_CONTROL_ALLOW_ORIGIN, origin.into());
        }
    }
    r.headers_mut()
        .append(ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("*"));
    if !r.headers().contains_key(ACCESS_CONTROL_EXPOSE_HEADERS) {
        r.headers_mut().append(
            ACCESS_CONTROL_EXPOSE_HEADERS,
            HeaderValue::from_static("X-Transmission-Session-Id"),
        );
    }
    r.headers_mut().append(
        ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("POST, OPTIONS"),
    );
}

async fn http_response(
    app: Arc<AppHandle>,
    args_lock: Arc<Semaphore>,
    req: Request<Body>,
) -> hyper::Result<Response<Body>> {
    let content_type = req
        .headers()
        .get("Content-Type")
        .and_then(|ct| ct.to_str().ok())
        .unwrap_or("");
    if content_type != "application/json" && req.method() != Method::OPTIONS {
        return Ok(invalid_request(req.headers(), "unexpected content-type"));
    }

    let toast = req.headers().get("X-TrguiNG-Toast").is_some();
    let sound = req.headers().get("X-TrguiNG-Sound").is_some();

    match (req.method(), req.uri().path()) {
        (&Method::POST, "/args") => {
            let payload = hyper::body::to_bytes(req.into_body()).await?;

            if app.get_window("main").is_none() {
                toggle_main_window(app.as_ref().clone(), None);
            }

            let lock = args_lock.acquire().await.unwrap();
            send_payload(&app, payload).await;
            drop(lock);

            Ok(Response::builder().body(Body::from("TrguiNG OK")).unwrap())
        }
        (&Method::OPTIONS, _) => {
            let mut response = Response::builder()
                .status(200u16)
                .body(Body::empty())
                .unwrap();
            cors(req.headers(), &mut response, ALLOW_ORIGINS);
            Ok(response)
        }
        (&Method::POST, "/post") => proxy_fetch(req).await,
        (&Method::POST, "/torrentget") => match proxy_fetch(req).await {
            Ok(response) => {
                if response.status().is_success() {
                    process_response(&app, response, toast, sound).await
                } else {
                    Ok(response)
                }
            }
            Err(e) => Err(e),
        },
        (&Method::POST, "/iplookup") => geoip_lookup(&app, req).await,
        _ => Ok(not_found()),
    }
}

async fn geoip_lookup(
    app: &Arc<AppHandle>,
    req: Request<Body>,
) -> Result<Response<Body>, hyper::Error> {
    let headers = req.headers().clone();
    let request_body = to_bytes(req.into_body()).await?;
    let request_bytes = request_body.as_ref();

    match serde_json::from_slice::<Vec<String>>(request_bytes) {
        Ok(ipstr) => {
            let ips: Vec<_> = ipstr.iter().map(|ip| ip.parse::<IpAddr>()).collect();
            let error_ips: Vec<_> = ips
                .iter()
                .enumerate()
                .filter(|(_, ip)| ip.is_err())
                .map(|(i, r)| (i, r.clone().err().unwrap()))
                .collect();
            if !error_ips.is_empty() {
                let msgs: Vec<_> = error_ips
                    .into_iter()
                    .map(|(i, e)| format!("{}: {}", ipstr[i], e))
                    .collect();
                let msg = format!("{}\n", msgs.join("\n"));
                return Ok(invalid_request(&headers, msg.as_str()));
            }

            let good_ips = ips.into_iter().map(|r| r.unwrap()).collect();

            let lookup_response = serde_json::to_string(&crate::geoip::lookup(app, good_ips).await);

            let mut response = Response::builder()
                .status(StatusCode::OK)
                .body(
                    lookup_response
                        .unwrap_or("Error serializing response".to_string())
                        .into(),
                )
                .unwrap();
            cors(&headers, &mut response, ALLOW_ORIGINS);
            Ok(response)
        }
        Err(e) => Ok(invalid_request(
            &headers,
            format!("Can not parse json: {}\n", e).as_str(),
        )),
    }
}

async fn proxy_fetch(req: Request<Body>) -> Result<Response<Body>, hyper::Error> {
    if let Some(query) = req.uri().query() {
        if let Some(url) = query
            .split('&')
            .map(|p| {
                let parts: Vec<&str> = p.split('=').collect();
                (parts[0], parts[1])
            })
            .find_map(|p| if p.0 == "url" { Some(p.1) } else { None })
        {
            let url = urlencoding::decode(url).ok().unwrap().into_owned();
            let headers = req.headers().clone();
            let tr_header = headers.get(TRANSMISSION_SESSION_ID);
            let auth_header = headers.get(AUTHORIZATION);
            let mut req_builder = Request::builder()
                .method(Method::POST)
                .uri(url.clone())
                .header(hyper::header::CONTENT_TYPE, "application/json")
                .header(hyper::header::ACCEPT_ENCODING, "gzip, deflate");
            if tr_header.is_some() {
                req_builder = req_builder.header(TRANSMISSION_SESSION_ID, tr_header.unwrap());
            }
            if auth_header.is_some() {
                req_builder = req_builder.header(AUTHORIZATION, auth_header.unwrap());
            }

            match req_builder.body(req.into_body()) {
                Ok(req) => {
                    let mut connector = TimeoutConnector::new(HttpsConnector::new());
                    connector.set_connect_timeout(Some(Duration::from_secs(10)));
                    connector.set_read_timeout(Some(Duration::from_secs(40)));
                    connector.set_write_timeout(Some(Duration::from_secs(20)));
                    let client = Client::builder().build::<_, hyper::Body>(connector);

                    match client.request(req).await {
                        Ok(mut response) => {
                            cors(&headers, &mut response, ALLOW_ORIGINS);
                            response.headers_mut().insert(
                                "X-Original-URL",
                                HeaderValue::from_str(url.as_ref()).unwrap(),
                            );
                            Ok(response)
                        }
                        Err(e) => {
                            if e.is_timeout()
                                || e.source().is_some_and(|s| {
                                    s.downcast_ref::<io::Error>()
                                        .is_some_and(|s| s.kind() == io::ErrorKind::TimedOut)
                                })
                            {
                                Ok(timed_out(&headers))
                            } else {
                                Err(e)
                            }
                        }
                    }
                }
                Err(e) => Ok(invalid_request(&headers, e.to_string().as_str())),
            }
        } else {
            return Ok(invalid_request(req.headers(), "no url query parameter"));
        }
    } else {
        return Ok(invalid_request(req.headers(), "no query parameters"));
    }
}

async fn send_payload(app: &AppHandle, payload: Bytes) {
    app.get_window("main")
        .unwrap()
        .emit(
            "app-arg",
            Payload(std::str::from_utf8(&payload).unwrap().to_string()),
        )
        .unwrap();
}

pub struct Ipc {
    pub listening: bool,
    listener: Option<TcpListener>,
    stop_signal: Option<oneshot::Sender<()>>,
    args_sem: Arc<Semaphore>,
    args_lock: Option<OwnedSemaphorePermit>,
}

impl Ipc {
    pub fn new() -> Self {
        Self {
            listening: false,
            listener: None,
            stop_signal: Default::default(),
            args_sem: Semaphore::new(1).into(),
            args_lock: None,
        }
    }

    pub async fn init(&mut self) {
        self.args_lock = self.args_sem.clone().acquire_owned().await.ok();
    }

    pub fn try_bind(&mut self) {
        if let Ok(listener) = TcpListener::bind(ADDRESS) {
            self.listener = Some(listener);
            self.listening = true;
        }
    }

    pub async fn listen(&mut self, app: Arc<AppHandle>) -> Result<(), &str> {
        if !self.listening {
            return Err("No TCP listener");
        }

        let args_sem = self.args_sem.clone();
        let make_service = make_service_fn(move |_| {
            let app = app.clone();
            let args_sem = args_sem.clone();
            let service_fn =
                service_fn(move |req| http_response(app.clone(), args_sem.clone(), req));
            async move { Ok::<_, hyper::Error>(service_fn) }
        });

        let (tx_stop, rx_stop) = oneshot::channel::<()>();

        if let Ok(server) = Server::from_tcp(self.listener.take().unwrap()) {
            let server = server
                .serve(make_service)
                .with_graceful_shutdown(async move {
                    rx_stop.await.ok();
                    println!("Shutdown request received");
                });

            self.stop_signal = Some(tx_stop);

            async_runtime::spawn(async move {
                server.await.unwrap();
            });

            Ok(())
        } else {
            Err("Unable to create server")
        }
    }

    pub fn start(&mut self) {
        drop(self.args_lock.take());
    }

    pub async fn pause(&mut self) {
        self.args_lock = self.args_sem.clone().acquire_owned().await.ok();
    }

    pub fn stop(&mut self) {
        if let Some(tx) = self.stop_signal.take() {
            tx.send(()).ok();
        }
        self.listener = None;
        self.listening = false;
    }

    pub async fn send(&self, args: &Vec<String>, app: Arc<AppHandle>) -> Result<(), hyper::Error> {
        let req = Request::builder()
            .method(Method::POST)
            .uri(format!("http://{}/args", ADDRESS))
            .header("content-type", "application/json")
            .body(Body::from(serde_json::to_vec(args).unwrap()))
            .unwrap();

        let client = Client::new();
        let should_stop = !self.listening;

        async_runtime::spawn(async move {
            if let Ok(resp) = client.request(req).await {
                if let Ok(resp_bytes) = hyper::body::to_bytes(resp.into_body()).await {
                    println!(
                        "Got response: {}",
                        std::str::from_utf8(&resp_bytes).unwrap()
                    );
                }
            }

            if should_stop {
                app.exit(0);
            }
        });

        Ok(())
    }
}
