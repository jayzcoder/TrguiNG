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

use base64::{engine::general_purpose::STANDARD as b64engine, Engine as _};
use hyper::{http::HeaderValue, Client, Method, Request};
use hyper_timeout::TimeoutConnector;
use hyper_tls::HttpsConnector;
use serde::Deserialize;
use std::{collections::HashMap, sync::Arc, time::Duration};
use tauri::{
    async_runtime::{self, JoinHandle, Mutex},
    AppHandle, Manager, State,
};

use crate::torrentcache::process_response;

#[derive(Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Connection {
    url: String,
    username: String,
    password: String,
}
#[derive(Deserialize, Debug, Clone, PartialEq)]
pub struct PollerConfig {
    name: String,
    connection: Connection,
    interval: u64,
}

#[derive(Debug)]
struct PollerConfigData {
    config: PollerConfig,
    transmission_session: Option<String>,
    join_handle: JoinHandle<()>,
}

#[derive(Default)]
pub struct Poller {
    configs: HashMap<String, PollerConfigData>,
    toast: bool,
    sound: bool,
    app_handle: Option<AppHandle>,
}

impl Poller {
    pub fn set_app_handle(&mut self, app_handle: &AppHandle) {
        self.app_handle = Some(app_handle.clone());
    }

    pub fn set_configs(&mut self, mut configs: Vec<PollerConfig>, toast: bool, sound: bool) {
        self.toast = toast;
        self.sound = sound;

        let mut old_configs = std::mem::take(&mut self.configs);
        old_configs.drain().for_each(|(_, c)| {
            c.join_handle.abort();
        });

        configs.drain(..).for_each(|c| {
            self.add_config(c);
        });
    }

    fn add_config(&mut self, config: PollerConfig) {
        if let Some(app) = &self.app_handle {
            let join_handle = async_runtime::spawn(polling_task(
                app.clone(),
                config.name.clone(),
                self.toast,
                self.sound,
            ));
            self.configs.insert(
                config.name.clone(),
                PollerConfigData {
                    config,
                    transmission_session: None,
                    join_handle,
                },
            );
        }
    }
}

#[derive(Default)]
pub struct PollerHandle(pub Arc<Mutex<Poller>>);

async fn polling_task(app: AppHandle, name: String, toast: bool, sound: bool) {
    let poller_handle: State<PollerHandle> = app.state();
    let interval;

    {
        let poller = poller_handle.0.lock().await;
        let config = &poller.configs.get(&name).unwrap().config;
        interval = config.interval;
    }

    loop {
        tokio::time::sleep(Duration::from_secs(interval)).await;

        // Acquire lock only to get copies of data needed for polling
        let poller = poller_handle.0.lock().await;
        let data = poller.configs.get(&name).unwrap();
        let connection = data.config.connection.clone();
        let session = data.transmission_session.clone();
        drop(poller);

        let result = poll(&app.clone(), connection.clone(), session, toast, sound).await;
        let mut new_session = None;

        match result {
            Ok(session) => {
                new_session = Some(session);
            }
            Err(Some(session)) => {
                // try again with new session token
                if let Ok(session) = poll(&app.clone(), connection, Some(session), toast, sound).await {
                    new_session = Some(session);
                }
            }
            Err(None) => {}
        }
        if let Some(session) = new_session {
            // Reaquire lock to write session token
            let mut poller = poller_handle.0.lock().await;
            let data = poller.configs.get_mut(&name).unwrap();
            data.transmission_session = Some(session);
        };
    }
}

const TRANSMISSION_SESSION: &str = "X-Transmission-Session-Id";
const AUTHORIZATION: &str = "Authorization";
const TORRENT_GET_BODY: &str = r#"
{
    "method": "torrent-get",
    "arguments": {
        "fields": ["id","name","status"]
    }
}"#;

async fn poll(
    app: &AppHandle,
    connection: Connection,
    session: Option<String>,
    toast: bool,
    sound: bool,
) -> Result<String, Option<String>> {
    let mut req = Request::builder()
        .uri(connection.url.clone())
        .header(hyper::header::ACCEPT_ENCODING, "gzip, deflate")
        .method(Method::POST);
    if let Some(session) = session {
        req = req.header(
            TRANSMISSION_SESSION,
            HeaderValue::from_str(session.as_str()).unwrap(),
        );
    }
    if !connection.username.is_empty() || !connection.password.is_empty() {
        let b64_value =
            b64engine.encode(format!("{}:{}", connection.username, connection.password).as_bytes());
        let value = format!("Basic {}", b64_value);
        req = req.header(
            AUTHORIZATION,
            HeaderValue::from_bytes(value.as_bytes()).unwrap(),
        );
    }
    let mut connector = TimeoutConnector::new(HttpsConnector::new());
    connector.set_connect_timeout(Some(Duration::from_secs(10)));
    connector.set_read_timeout(Some(Duration::from_secs(40)));
    connector.set_write_timeout(Some(Duration::from_secs(20)));
    let client = Client::builder().build::<_, hyper::Body>(connector);

    match client
        .request(req.body(TORRENT_GET_BODY.into()).unwrap())
        .await
    {
        Ok(mut response) => {
            response.headers_mut().append(
                "X-Original-URL",
                HeaderValue::from_str(&connection.url).unwrap(),
            );
            let session = response
                .headers()
                .get(TRANSMISSION_SESSION)
                .map(|v| v.to_owned());
            if response.status().is_success() || response.status().as_u16() == 409 {
                let session_str = session.map_or(String::default(), |f| {
                    f.to_str().unwrap_or_default().to_string()
                });
                if response.status().is_success() {
                    let _ = process_response(app, response, toast, sound).await;
                    Ok(session_str)
                } else {
                    Err(Some(session_str))
                }
            } else {
                println!(
                    "Unexpected status code during polling: {:?}",
                    response.status()
                );
                Err(None)
            }
        }
        Err(e) => {
            println!("Error during polling: {:?}", e);
            Err(None)
        }
    }
}
