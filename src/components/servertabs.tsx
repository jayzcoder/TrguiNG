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

import { ConfigContext } from "../config";
import type { ServerConfig } from "../config";
import React, { useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as Icon from "react-bootstrap-icons";
import type { ClientManager } from "../clientmanager";
import { ActionIcon, Menu, Tabs } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";

const { appWindow, invoke } = await import(/* webpackChunkName: "taurishim" */"taurishim");

interface ServerTabsProps extends React.PropsWithChildren {
    clientManager: ClientManager,
    servers: ServerConfig[],
    setCurrentServer: React.Dispatch<ServerConfig | undefined>,
}

export interface ServerTabsRef {
    openTab: (tab: string) => void,
    getOpenTabs: () => string[],
    switchTab: (tab: number) => void,
}

export const ServerTabs = React.forwardRef<ServerTabsRef, ServerTabsProps>(function ServerTabs(props, ref) {
    const config = useContext(ConfigContext);

    const [tabs, setTabs] = useState({
        openTabs: config.getOpenTabs(),
        currentTab: config.values.app.lastTab,
    });

    useEffect(() => {
        config.setOpenTabs(tabs.openTabs, tabs.currentTab);
        if (tabs.currentTab < 0) {
            void appWindow.setTitle("Transmission GUI");
        }
    }, [config, tabs]);

    useEffect(() => {
        const pollerConfigs = tabs.openTabs.filter((_, i) => i !== tabs.currentTab).map((t) => {
            const serverConfig = config.getServer(t);
            if (serverConfig === undefined) return undefined;
            return {
                name: serverConfig.name,
                connection: serverConfig.connection,
                interval: serverConfig.intervals.torrentsMinimized,
            };
        }).filter((c) => c !== undefined);
        void invoke(
            "set_poller_config",
            {
                configs: pollerConfigs,
                toast: config.values.app.toastNotifications,
                sound: config.values.app.toastNotificationSound,
            });
    }, [config, props.servers, config.values.app, tabs]);

    const { setCurrentServer } = props;

    const switchTab = useCallback((tab: number) => {
        setCurrentServer(config.getServer(tabs.openTabs[tab]));
        setTabs({ ...tabs, currentTab: tab });
    }, [config, setCurrentServer, tabs]);

    useHotkeys([
        ["mod + TAB", useCallback((e) => {
            e.preventDefault();
            switchTab((tabs.currentTab + 1) % tabs.openTabs.length);
        }, [switchTab, tabs])],
        ["mod + shift + TAB", useCallback((e) => {
            e.preventDefault();
            switchTab((tabs.currentTab + tabs.openTabs.length - 1) % tabs.openTabs.length);
        }, [switchTab, tabs])],
    ]);

    const openTab = useCallback((name: string) => {
        if (tabs.openTabs.includes(name)) return;
        props.clientManager.open(name, config.values.app.toastNotifications, config.values.app.toastNotificationSound);
        setCurrentServer(config.getServer(name));
        setTabs({ ...tabs, openTabs: [...tabs.openTabs, name], currentTab: tabs.openTabs.length });
    }, [tabs, props.clientManager, setCurrentServer, config]);

    const closeTab = useCallback((tab: number) => {
        if (tab >= tabs.openTabs.length) return;

        props.clientManager.close(tabs.openTabs[tab]);

        const newTabs = {
            openTabs: tabs.openTabs.filter((_, i) => i !== tab),
            currentTab: tabs.currentTab,
        };

        if (tabs.currentTab > tab ||
            (tabs.currentTab === tab && newTabs.currentTab === tabs.openTabs.length - 1)) {
            newTabs.currentTab -= 1;
        }

        setCurrentServer(config.getServer(newTabs.openTabs[newTabs.currentTab]));
        setTabs(newTabs);
    }, [tabs, props.clientManager, setCurrentServer, config]);

    const unopenedTabs = useMemo(() => {
        return props.servers.filter((s) => !tabs.openTabs.includes(s.name)).map((s) => s.name);
    }, [props.servers, tabs.openTabs]);

    useImperativeHandle(ref, () => ({
        openTab,
        getOpenTabs: () => tabs.openTabs,
        switchTab,
    }));

    const onServersChange = useRef<(s: ServerConfig[]) => void>();
    onServersChange.current = useCallback((servers: ServerConfig[]) => {
        const newOpenTabs: string[] = [];
        let newCurrentTab = 0;
        tabs.openTabs.forEach((serverName) => {
            props.clientManager.close(serverName);
            if (servers.find((s) => s.name === serverName) !== undefined) {
                props.clientManager.open(serverName, config.values.app.toastNotifications, config.values.app.toastNotificationSound);
                newOpenTabs.push(serverName);
                if (serverName === tabs.openTabs[tabs.currentTab]) {
                    newCurrentTab = newOpenTabs.length - 1;
                }
            }
        });
        setTabs({
            openTabs: newOpenTabs,
            currentTab: newCurrentTab,
        });
        setCurrentServer(config.getServer(newOpenTabs[newCurrentTab]));
    }, [tabs, setCurrentServer, config, props.clientManager]);

    useEffect(() => {
        onServersChange.current?.(props.servers);
    }, [props.servers]);

    return (
        <Tabs
            variant="outline"
            radius="lg"
            value={String(tabs.currentTab)}
            onTabChange={(value) => { switchTab(Number(value)); }}
            styles={(theme) => ({
                tab: {
                    flexBasis: "12rem",
                    flexShrink: 1,
                    borderColor: theme.colorScheme === "dark" ? theme.colors.dark[5] : theme.colors.gray[2],
                    "&[data-active]": {
                        borderColor: theme.colorScheme === "dark" ? theme.colors.dark[3] : theme.colors.gray[5],
                    },
                },
                tabLabel: {
                    marginInline: "auto",
                    color: theme.colors.gray[6],
                    "[data-active] &": {
                        color: theme.colorScheme === "dark" ? theme.colors.gray[3] : theme.colors.dark[8],
                    },
                },
                tabRightSection: {
                    padding: "0.2rem",
                },
                tabsList: {
                    flexWrap: "nowrap",
                },
            })}
        >
            <Tabs.List px="sm">
                {tabs.openTabs.map((name, index) =>
                    <Tabs.Tab
                        key={index}
                        value={String(index)}
                        rightSection={
                            <Icon.XLg size="1.1rem" onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                closeTab(index);
                            }} />
                        }
                    >
                        {name}
                    </Tabs.Tab>)}
                {unopenedTabs.length > 0
                    ? <Menu shadow="md" width={200} position="bottom-start">
                        <Menu.Target>
                            <ActionIcon variant="subtle" color="secondaryColorName" my="auto">
                                <Icon.PlusLg size="1.1rem" />
                            </ActionIcon>
                        </Menu.Target>

                        <Menu.Dropdown>
                            <Menu.Label>Connect</Menu.Label>
                            {unopenedTabs.map((tab) =>
                                <Menu.Item key={tab} onClick={() => { openTab(tab); }}>{tab}</Menu.Item>)
                            }
                        </Menu.Dropdown>
                    </Menu>
                    : <></>}
                {props.children}
            </Tabs.List>
        </Tabs>
    );
});
