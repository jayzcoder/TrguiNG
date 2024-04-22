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

import { Button, Checkbox, Divider, Group, Text } from "@mantine/core";
import type { ModalState } from "./common";
import { HkModal, TorrentsNames } from "./common";
import React, {useCallback, useContext, useEffect, useMemo, useState} from "react";
import { useRemoveTorrents } from "queries";
import { notifications } from "@mantine/notifications";
import {Torrent, useServerSelectedTorrents, useServerTorrentData} from "rpc/torrent";
import { ConfigContext } from "config";
import {ensurePathDelimiter, fileSystemSafeName} from "../../trutil";

export function RemoveModal(props: ModalState) {
    const config = useContext(ConfigContext);
    const serverSelected = useServerSelectedTorrents();
    const [deleteData, setDeleteData] = useState<boolean>(false);
    const [deleteDataWhenOne, setDeleteDataWhenOne] = useState<boolean>(false);

    useEffect(() => {
        if (props.opened) {
            if (config.values.interface.deleteTorrentData !== "记住选择") {
                setDeleteData(config.values.interface.deleteTorrentData === "默认开");
            } else {
                setDeleteData(config.values.interface.deleteTorrentDataSelection);
            }
            setDeleteDataWhenOne(config.values.interface.deleteTorrentDataWhenOneSelection);
        }
    }, [config, props.opened]);

    const onDeleteDataChanged = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.currentTarget.checked;
        if (value) setDeleteDataWhenOne(false);
        setDeleteData(value);
        config.values.interface.deleteTorrentDataSelection = value;
    }, [config]);

    const onDeleteDataWhenOneChanged = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.currentTarget.checked;
        if (value) setDeleteData(false);
        setDeleteDataWhenOne(value);
        config.values.interface.deleteTorrentDataWhenOneSelection = value;
    }, [config]);

    const remove = useRemoveTorrents();
    const serverData = useServerTorrentData();

    const onDelete = useCallback(() => {
        if (deleteDataWhenOne) {
            const selectTorrents = serverData.torrents.filter((t) => serverSelected.has(t.id));
            console.log(selectTorrents);
            let allPaths = new Map<string, number>;
            selectTorrents.forEach((t) => {
                const path = ensurePathDelimiter(t.downloadDir) + fileSystemSafeName(t.name);
                allPaths.set(path, 0);
            });
            serverData.torrents.forEach((t) => {
                const path = ensurePathDelimiter(t.downloadDir) + fileSystemSafeName(t.name);
                const count = allPaths.get(path) ?? -1;
                if (count >= 0) {
                    allPaths.set(path, count+1);
                }
            });
            selectTorrents.forEach((t) => {
                const path = ensurePathDelimiter(t.downloadDir) + fileSystemSafeName(t.name);
                const count = allPaths.get(path) ?? -1;
                if (count >= 0) {
                    allPaths.set(path, count-1);
                }
            });
            let notDeleteDataIds: number[] = [];
            let deleteDataIds: number[] = [];
            selectTorrents.forEach((t) => {
                const path = ensurePathDelimiter(t.downloadDir) + fileSystemSafeName(t.name);
                const count = allPaths.get(path) ?? -1;
                if (count == 0) {
                    deleteDataIds.push(t.id);
                } else {
                    notDeleteDataIds.push(t.id);
                }
            })
            if (notDeleteDataIds.length > 0) {
                remove(
                    {
                        torrentIds: notDeleteDataIds,
                        deleteData: false,
                    },
                    {
                        onSuccess: () => {
                            if (deleteDataIds.length <= 0) {
                                notifications.show({
                                    message: "删除种子完成",
                                    color: "green",
                                });
                            }
                        },
                        onError: (e) => {
                            console.log("删除种子出错", e);
                            notifications.show({
                                message: "删除种子出错",
                                color: "red",
                            });
                        },
                    },
                );
            }
            if (deleteDataIds.length > 0) {
                remove(
                    {
                        torrentIds: deleteDataIds,
                        deleteData: true,
                    },
                    {
                        onSuccess: () => {
                            notifications.show({
                                message: "删除种子完成",
                                color: "green",
                            });
                        },
                        onError: (e) => {
                            console.log("删除种子(含数据)出错", e);
                            notifications.show({
                                message: "删除种子(含数据)出错",
                                color: "red",
                            });
                        },
                    },
                );
            }
        } else {
            remove(
                {
                    torrentIds: Array.from(serverSelected),
                    deleteData,
                },
                {
                    onSuccess: () => {
                        notifications.show({
                            message: "删除种子完成",
                            color: "green",
                        });
                    },
                    onError: (e) => {
                        console.log("删除种子出错", e);
                        notifications.show({
                            message: "删除种子出错",
                            color: "red",
                        });
                    },
                },
            );
        }
        props.close();
    }, [remove, serverData, serverSelected, deleteData, deleteDataWhenOne, props]);

    return (
        <HkModal opened={props.opened} onClose={props.close} title="删除种子确认" centered size="xl">
            <Divider my="sm" />
            <Text mb="md">确认要删除已选择的种子吗？</Text>
            <TorrentsNames />
            <Checkbox
                label="同时删除数据"
                disabled={deleteDataWhenOne}
                checked={deleteData}
                onChange={onDeleteDataChanged}
                my="xl" />
            <Checkbox
                label="没有其他站点保种则删除数据"
                disabled={deleteData}
                checked={deleteDataWhenOne}
                onChange={onDeleteDataWhenOneChanged}
                my="xl" />
            <Divider my="sm" />
            <Group position="center" spacing="md">
                <Button onClick={onDelete} variant="filled" color="red" data-autofocus>
                    {deleteData ? "删除种子和数据" : (deleteDataWhenOne ? "删除种子和无保种数据" : "删除种子")}
                </Button>
                <Button onClick={props.close} variant="light">取消</Button>
            </Group>
        </HkModal>
    );
}
