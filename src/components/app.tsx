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

import { ConfigContext, ServerConfigContext } from "../config";
import type { ServerConfig } from "../config";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Server } from "../components/server";
import { ClientManager } from "../clientmanager";
import { ActionIcon, Box, Button, Flex, Stack, useMantineColorScheme } from "@mantine/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "queries";
import { Notifications } from "@mantine/notifications";
import { ClientContext } from "rpc/client";
import type { ServerTabsRef } from "./servertabs";
import { ServerTabs } from "./servertabs";
import { useDisclosure, useHotkeys } from "@mantine/hooks";
import * as Icon from "react-bootstrap-icons";
import { modKeyString } from "trutil";
import { ColorSchemeToggle, FontSizeToggle, ShowVersion } from "./miscbuttons";
import { AppSettingsModal } from "./modals/settings";

const { appWindow, invoke, makeCreateTorrentView } = await import(/* webpackChunkName: "taurishim" */"taurishim");

interface PassEventData {
    from: string,
    payload: string,
}

function CreateTorrentButton() {
    const config = useContext(ConfigContext);
    const { colorScheme } = useMantineColorScheme();

    useEffect(() => {
        const unlisten = appWindow.listen<PassEventData>("pass-from-window", ({ payload: data }) => {
            if (data.payload === "ready") {
                void invoke("pass_to_window", {
                    to: data.from,
                    payload: JSON.stringify({ colorScheme, defaultTrackers: config.values.interface.defaultTrackers }),
                });
            }
        });
        return () => { void unlisten.then((u) => { u(); }); };
    }, [colorScheme, config]);

    const onClick = useCallback(() => {
        void makeCreateTorrentView();
    }, []);

    useHotkeys([
        ["mod + T", onClick],
    ]);

    return (
        <ActionIcon
            variant="default"
            size="lg"
            onClick={onClick}
            title={`创建种子 (${modKeyString()} + T)`}
            my="auto"
        >
            <Icon.Stars size="1.1rem" />
        </ActionIcon>
    );
}

export function App(props: React.PropsWithChildren) {
    return (
        <QueryClientProvider client={queryClient}>
            <Notifications limit={5} style={{ bottom: "2.5rem" }} />
            {props.children}
            <ReactQueryDevtools toggleButtonProps={{ style: { marginBottom: "2rem" } }} />
        </QueryClientProvider>
    );
}

export default function TauriApp() {
    const config = useContext(ConfigContext);
    const clientManager = useMemo(() => {
        const cm = new ClientManager(config);
        config.getOpenTabs().forEach((tab) => {
            cm.open(tab, config.values.app.toastNotifications, config.values.app.toastNotificationSound);
        });
        return cm;
    }, [config]);

    const tabsRef = useRef<ServerTabsRef>(null);

    const [currentServer, setCurrentServer] = useState<ServerConfig | undefined>(
        config.getServer(config.getLastOpenTab()));
    const [servers, setServers] = useState(config.getServers());

    const [showServerConfig, serverConfigHandlers] = useDisclosure(false);

    const onServerSave = useCallback((servers: ServerConfig[]) => {
        setServers(servers);
        config.setServers(servers);
    }, [config]);

    return (
        <App>
            <AppSettingsModal
                onSave={onServerSave}
                opened={showServerConfig} close={serverConfigHandlers.close} />
            <Flex direction="column" h="100%" w="100%" >
                <ServerTabs ref={tabsRef}
                    clientManager={clientManager}
                    servers={servers}
                    setCurrentServer={setCurrentServer} >
                    <ShowVersion btn="lg" />
                    <ColorSchemeToggle btn="lg" />
                    <FontSizeToggle btn="lg"/>
                    <CreateTorrentButton />
                    <ActionIcon
                        size="lg" variant="default" my="auto"
                        title="应用设置"
                        onClick={serverConfigHandlers.open}>
                        <Icon.GearFill size="1.1rem" />
                    </ActionIcon>
                </ServerTabs>
                {currentServer !== undefined
                    ? <ServerConfigContext.Provider value={currentServer}>
                        <ClientContext.Provider value={clientManager.getClient(currentServer.name)}>
                            <Server hostname={clientManager.getHostname(currentServer.name)} tabsRef={tabsRef} />
                        </ClientContext.Provider>
                    </ServerConfigContext.Provider>
                    : <Flex justify="center" align="center" w="100%" h="100%">
                        <Stack mih="20rem">
                            {servers.map((s, i) => {
                                return <Button key={i} variant="subtle"
                                    onClick={() => tabsRef.current?.openTab(s.name)}>{s.name}
                                </Button>;
                            })}
                            <Box sx={{ flexGrow: 1 }} />
                            <Button onClick={serverConfigHandlers.open}>
                                Configure servers
                            </Button>
                        </Stack>
                    </Flex>
                }
            </Flex>
        </App>
    );
}
