/**
 * TrguiNG - next gen remote GUI for transmission torrent daemon
 * Copyright (C) 2023  qu1ck (mail at qu1ck.org)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import "css/loader.css";
import { Config, ConfigContext } from "./config";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import React, { lazy, Suspense, useContext } from "react";
import type { CSSProperties } from "react";
const { TAURI, appWindow, invoke } = await import(/* webpackChunkName: "taurishim" */"taurishim");

const TauriApp = lazy(async () => await import("components/app"));
const WebApp = lazy(async () => await import("components/webapp"));
const CustomMantineProvider = lazy(
    async () => await import("components/mantinetheme"));

async function onCloseRequested(app: Root, config: Config) {
    await config.save();
    await appWindow.emit("listener-pause", {});
    app.unmount();
    const configs = config.getOpenServers().map((serverConfig) => ({
        name: serverConfig.name,
        connection: serverConfig.connection,
        interval: serverConfig.intervals.torrentsMinimized,
    }));
    await invoke("set_poller_config", {
        configs, toast: config.values.app.toastNotifications, sound: config.values.app.toastNotificationSound,
    });
    void appWindow.emit("frontend-done");
}

async function onFocusChange(focused: boolean, config: Config) {
    if (!focused && config.values.app.onMinimize === "隐藏") {
        if (await appWindow.isMinimized()) {
            void appWindow.emit("window-hidden");
            void appWindow.hide();
        }
    }
}

function setupTauriEvents(config: Config, app: Root) {
    void appWindow.onCloseRequested((event) => {
        if (config.values.app.onClose === "隐藏") {
            event.preventDefault();
            void appWindow.emit("window-hidden");
            void appWindow.hide();
        } else if (config.values.app.onClose === "退出") {
            event.preventDefault();
            config.save().finally(() => {
                void appWindow.emit("app-exit");
            });
        } else {
            void onCloseRequested(app, config);
        }
    });

    void appWindow.listen("exit-requested", (event) => {
        void onCloseRequested(app, config);
    });

    void appWindow.onFocusChanged(({ payload: focused }) => {
        void onFocusChange(focused, config);
    });

    void appWindow.onResized(({ payload: size }) => {
        config.values.app.window.size = [size.width, size.height];
    });

    void appWindow.onMoved(({ payload: size }) => {
        config.values.app.window.position = [size.x, size.y];
    });
}

function setupWebEvents(config: Config) {
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            config.save().catch((e) => { });
        }
    });
}

function Loader() {
    const config = useContext(ConfigContext);

    const interfaceConfig = config.values.interface;
    const theme = interfaceConfig.theme;
    const backgroundColorOverride =
        interfaceConfig.styleOverrides[theme ?? "light"]?.backgroundColor;
    const spinnerStyle: CSSProperties = {
        borderTopColor: `hsla(222, 100%, ${theme === "dark" ? "50%" : "36%"}, 0.376)`,
    };

    return (
        <div
            className="loader-container"
            style={{
                backgroundColor:
                    backgroundColorOverride?.computed ??
                    (theme === "dark" ? "#1A1B1E" : "#fff"), // #1A1B1E comes from theme.colors.dark[7]
            }}
        >
            <div className="lds-ring">
                <div style={spinnerStyle}></div>
                <div style={spinnerStyle}></div>
                <div style={spinnerStyle}></div>
                <div style={spinnerStyle}></div>
            </div>
        </div>
    );
}

async function run(config: Config) {
    const appnode = document.getElementById("app") as HTMLElement;
    const app = createRoot(appnode);

    if (TAURI) {
        setupTauriEvents(config, app);
        if (config.values.app.showTrayIcon) {
            void invoke("create_tray");
        }
    } else {
        setupWebEvents(config);
    }

    const size = config.values.app.window.size;
    if (size.length === 2 && size[0] > 100 && size[1] > 100) {
        await appWindow.setSize(size);
    }

    const pos = config.values.app.window.position;
    if (pos?.length === 2 && pos?.[0] > -32000 && pos?.[1] > -32000) {
        await appWindow.setPosition(pos);
    } else {
        await appWindow.center();
    }

    app.render(
        <React.StrictMode>
            <ConfigContext.Provider value={config}>
                <Suspense fallback={<Loader />}>
                    <CustomMantineProvider>
                        {TAURI && <TauriApp />}
                        {!TAURI && <WebApp />}
                    </CustomMantineProvider>
                </Suspense>
            </ConfigContext.Provider>
        </React.StrictMode>);
}

window.onload = (event) => {
    new Config().read().then(run).catch(console.error);
};
