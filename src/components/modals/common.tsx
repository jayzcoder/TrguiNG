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

import type { ModalProps, MultiSelectValueProps } from "@mantine/core";
import {
    Badge, Button, CloseButton, Divider, Group, Loader, Modal, MultiSelect,
    Text, TextInput, ActionIcon, Menu, ScrollArea,
} from "@mantine/core";
import { ConfigContext, ServerConfigContext } from "config";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { pathMapFromServer, pathMapToServer } from "trutil";
import * as Icon from "react-bootstrap-icons";
import { useServerSelectedTorrents, useServerTorrentData } from "rpc/torrent";
import { useHotkeysContext } from "hotkeys";
const { TAURI, dialogOpen } = await import(/* webpackChunkName: "taurishim" */"taurishim");

export interface ModalState {
    opened: boolean,
    close: () => void,
}

export function HkModal(props: ModalProps) {
    const hk = useHotkeysContext();

    useEffect(() => {
        hk.active = !props.opened;

        return () => { hk.active = true; };
    }, [props.opened, hk]);

    return <Modal {...props}>{props.children}</Modal>;
}

interface SaveCancelModalProps extends ModalProps {
    onSave: () => void,
    onClose: () => void,
    saveLoading?: boolean,
}

export function SaveCancelModal({ onSave, onClose, children, saveLoading, ...other }: SaveCancelModalProps) {
    return (
        <HkModal onClose={onClose} {...other}>
            <Divider my="sm" />
            {children}
            <Divider my="sm" />
            <Group position="center" spacing="md">
                <Button onClick={onSave} variant="filled" data-autofocus>
                    {saveLoading === true ? <Loader size="1rem" /> : "保存"}
                </Button>
                <Button onClick={onClose} variant="light">取消</Button>
            </Group>
        </HkModal>
    );
}

export function LimitedNamesList({ names, limit }: { names: string[], limit?: number }) {
    limit = limit ?? 5;
    const t = names.slice(0, limit);

    return <>
        <Text mx="xl" mb="md">{`选中总数：${names.length}`}</Text>
        {t.map((s, i) => <Text key={i} mx="md" my="xs" px="sm" sx={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            boxShadow: "inset 0 0 0 9999px rgba(133, 133, 133, 0.1)",
        }}>
            {s}
        </Text>)}
        {names.length > limit && <Text mx="xl" mb="md">{`... and ${names.length - limit} more`}</Text>}
    </>;
}

export function TorrentsNames() {
    const serverData = useServerTorrentData();
    const serverSelected = useServerSelectedTorrents();

    const allNames = useMemo<string[]>(() => {
        if (serverData.current == null || serverSelected.size === 0) {
            return [];
        }
        return serverData.torrents.filter(
            (t) => serverSelected.has(t.id)).map((t) => t.name);
    }, [serverData, serverSelected]);

    return <LimitedNamesList names={allNames} />;
}

export interface LocationData {
    path: string,
    setPath: (s: string) => void,
    lastPaths: string[],
    addPath: (dir: string) => void,
    removePath: (dir: string) => void,
    browseHandler: () => void,
    inputLabel?: string,
    disabled?: boolean,
    focusPath?: boolean,
}

export function useTorrentLocation(): LocationData {
    const config = useContext(ConfigContext);
    const serverConfig = useContext(ServerConfigContext);
    const [lastPaths, setLastPaths] = useState([] as string[]);

    useEffect(() => {
        setLastPaths(serverConfig.lastSaveDirs);
    }, [serverConfig]);

    const [path, setPath] = useState<string>("");

    const pathRef = useRef(path);
    pathRef.current = path;

    useEffect(() => {
        if (!lastPaths.includes(pathRef.current) && lastPaths.length > 0) {
            setPath(lastPaths[0]);
        }
    }, [lastPaths]);

    const browseHandler = useCallback(() => {
        const mappedLocation = pathMapFromServer(path, serverConfig);
        console.log("Mapped location: ", mappedLocation);
        dialogOpen({
            title: "选择目录",
            defaultPath: mappedLocation === "" ? undefined : mappedLocation,
            directory: true,
        }).then((directory) => {
            if (directory === null) return;
            const mappedPath = pathMapToServer((directory as string).replace(/\\/g, "/"), serverConfig);
            setPath(mappedPath.replace(/\\/g, "/"));
        }).catch(console.error);
    }, [serverConfig, path, setPath]);

    const addPath = useCallback((dir: string) => {
        config.addSaveDir(serverConfig.name, dir);
        setLastPaths([...serverConfig.lastSaveDirs]);
    }, [config, serverConfig]);

    const removePath = useCallback((dir: string) => {
        config.removeSaveDir(serverConfig.name, dir);
        setLastPaths([...serverConfig.lastSaveDirs]);
    }, [config, serverConfig]);

    return { path, setPath, lastPaths, addPath, removePath, browseHandler };
}

export function TorrentLocation(props: LocationData) {
    return (
        <Group align="flex-end">
            <TextInput
                value={props.path}
                label={props.inputLabel}
                disabled={props.disabled}
                onChange={(e) => { props.setPath(e.currentTarget.value); }}
                styles={{ root: { flexGrow: 1 } }}
                data-autofocus={props.focusPath}
                rightSection={
                    <Menu position="left-start" withinPortal
                        middlewares={{ shift: true, flip: false }} offset={{ mainAxis: -20, crossAxis: 30 }}>
                        <Menu.Target>
                            <ActionIcon py="md" disabled={props.disabled}>
                                <Icon.ClockHistory size="16" />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <ScrollArea.Autosize
                                type="auto"
                                mah="calc(100vh - 0.5rem)"
                                miw={TAURI ? "40.05rem" : "46.5rem"}
                                offsetScrollbars
                                styles={{ viewport: { paddingBottom: 0 } }}
                            >
                                {props.lastPaths.map((path) => (
                                    <Menu.Item key={path}
                                        onClick={() => { props.setPath(path); }}
                                        rightSection={
                                            <ActionIcon
                                                component="div"
                                                title="移除"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    props.removePath(path);
                                                }}
                                                className="list-delete-icon">
                                                <Icon.Trash size="12" />
                                            </ActionIcon>}
                                    >
                                        {path}
                                    </Menu.Item>
                                ))}
                            </ScrollArea.Autosize>
                        </Menu.Dropdown>
                    </Menu>
                } />
            {TAURI && <Button onClick={props.browseHandler} disabled={props.disabled}>选择目录</Button>}
        </Group>
    );
}

export function Label({
    label,
    onRemove,
    classNames,
    ...others
}: MultiSelectValueProps) {
    return (
        <div {...others}>
            <Badge radius="md" variant="filled"
                rightSection={
                    <CloseButton
                        onMouseDown={onRemove}
                        title="删除"
                        color="gray.0"
                        variant="transparent"
                        size={22}
                        iconSize={14}
                        tabIndex={-1}
                        mr="-0.25rem"
                    />
                }
            >
                {label}
            </Badge>
        </div>
    );
}

interface TorrentLabelsProps {
    labels: string[],
    setLabels: React.Dispatch<string[]>,
    inputLabel?: string,
    disabled?: boolean,
    initiallyOpened?: boolean,
}

export function TorrentLabels(props: TorrentLabelsProps) {
    const config = useContext(ConfigContext);
    const serverData = useServerTorrentData();

    const initialLabelset = useMemo(() => {
        const labels = new Set<string>(config.values.interface.preconfiguredLabels);
        serverData.torrents.forEach((t) => t.labels?.forEach((l: string) => labels.add(l)));

        return Array.from(labels).sort();
    }, [config, serverData.torrents]);

    const [data, setData] = useState<string[]>(initialLabelset);

    return (
        <MultiSelect
            data={data}
            value={props.labels}
            onChange={props.setLabels}
            label={props.inputLabel}
            withinPortal
            searchable
            creatable
            initiallyOpened={props.initiallyOpened}
            disabled={props.disabled}
            getCreateLabel={(query) => `+ 新增 ${query}`}
            onCreate={(query) => {
                setData((current) => [...current, query]);
                return query;
            }}
            valueComponent={Label}
        />
    );
}
