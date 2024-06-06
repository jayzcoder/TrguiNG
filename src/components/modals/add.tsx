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

import {
    Box,
    Button,
    Checkbox,
    Divider,
    Flex, Grid,
    Group,
    Menu, NumberInput,
    SegmentedControl,
    Text,
    Textarea,
    TextInput
} from "@mantine/core";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ModalState, LocationData } from "./common";
import { HkModal, LimitedNamesList, TorrentLabels, TorrentLocation, useTorrentLocation } from "./common";
import type { PriorityNumberType } from "rpc/transmission";
import { PriorityColors, PriorityStrings } from "rpc/transmission";
import type { Torrent } from "rpc/torrent";
import { useServerTorrentData, useServerRpcVersion } from "rpc/torrent";
import { CachedFileTree } from "cachedfiletree";
import { FileTreeTable, useUnwantedFiles } from "components/tables/filetreetable";
import { notifications } from "@mantine/notifications";
import type { TorrentAddQueryParams } from "queries";
import { useAddTorrent, useFileTree, useTorrentAddTrackers } from "queries";
import { ConfigContext, ServerConfigContext } from "config";
import type { ServerTabsRef } from "components/servertabs";
import { bytesToHumanReadableStr, decodeMagnetLink } from "trutil";
import {RunStatus} from "../../status";
import {trim} from "lodash-es";
const { TAURI, dialogOpen, invoke } = await import(/* webpackChunkName: "taurishim" */"taurishim");

interface AddCommonProps extends React.PropsWithChildren {
    location: LocationData,
    labels: string[],
    setLabels: React.Dispatch<string[]>,
    start: boolean,
    setStart: (b: boolean) => void,
    priority: PriorityNumberType,
    setPriority: (p: PriorityNumberType) => void,
    disabled?: boolean,
    isMagnet?: boolean,
    delay: boolean,
    setDelay: (b: boolean) => void,
    delayTime: number,
    setDelayTime: (n: number) => void,
}

function AddCommon(props: AddCommonProps) {
    const rpcVersion = useServerRpcVersion();

    return <>
        <TorrentLocation {...props.location} inputLabel="保存目录" disabled={props.disabled} />
        {rpcVersion >= 17 &&
            <TorrentLabels labels={props.labels} setLabels={props.setLabels} inputLabel="用户标签" disabled={props.disabled} />}
        {props.isMagnet && <Group mt="lg">
            <Checkbox
                my="xl"
                pr="xl"
                label="种子下载间隔"
                checked={props.delay}
                onChange={() => { props.setDelay(!props.delay); }} />
            <NumberInput
                w="5rem"
                min={0}
                disabled={!props.delay}
                value={props.delayTime}
                onChange={(v) => { props.setDelayTime(typeof v === "number" ? v : 5); }} />
            秒
        </Group>}
        <Group>
            <Checkbox
                label="自动开始"
                checked={props.start}
                disabled={props.disabled}
                onChange={(e) => { props.setStart(e.currentTarget.checked); }}
                my="md"
                styles={{ root: { flexGrow: 1 } }} />
            {props.children}
            <SegmentedControl
                color={PriorityColors.get(props.priority)}
                value={String(props.priority)}
                onChange={(value) => { props.setPriority(+value as PriorityNumberType); }}
                disabled={props.disabled}
                data={Array.from(PriorityStrings.entries()).map(([k, v]) => ({
                    value: String(k),
                    label: v,
                }))} />
        </Group>
    </>;
}

interface AddCommonModalProps extends ModalState {
    serverName: string,
    uris: Array<string | File> | undefined,
    tabsRef: React.RefObject<ServerTabsRef>,
    setStatus: (status: RunStatus) => void,
}

function useCommonProps() {
    const location = useTorrentLocation();
    const [labels, setLabels] = useState<string[]>([]);
    const [start, setStart] = useState<boolean>(false);
    const [priority, setPriority] = useState<PriorityNumberType>(0);
    const [delay, setDelay] = useState<boolean>(false);
    const [delayTime, setDelayTime] = useState<number>(5);

    const props = useMemo<AddCommonProps>(() => ({
        location,
        labels,
        setLabels,
        start,
        setStart,
        priority,
        setPriority,
        delay,
        setDelay,
        delayTime,
        setDelayTime,
    }), [location, labels, start, priority, delay, delayTime]);

    return useMemo(() => ({
        location,
        start,
        priority,
        props,
    }), [location, priority, props, start]);
}

function TabSwitchDropdown({ tabsRef }: { tabsRef: React.RefObject<ServerTabsRef> }) {
    const serverConfig = useContext(ServerConfigContext);

    const [value, setValue] = useState(serverConfig.name);

    useEffect(() => {
        setValue(serverConfig.name);
    }, [serverConfig]);

    const onChange = useCallback((value: string) => {
        setValue(value);
        const tabIndex = tabsRef.current?.getOpenTabs().findIndex((v) => v === value);
        if (tabIndex !== undefined) tabsRef.current?.switchTab(tabIndex);
    }, [tabsRef]);

    return (
        tabsRef.current == null
            ? <></>
            : <Menu shadow="md" width={200} position="bottom-start">
                <Menu.Target>
                    <Button variant="subtle" title="选择服务器">
                        {value}
                    </Button>
                </Menu.Target>

                <Menu.Dropdown>
                    {tabsRef.current.getOpenTabs().map((tab) =>
                        <Menu.Item key={tab} onClick={() => { onChange(tab); }}>{tab}</Menu.Item>)
                    }
                </Menu.Dropdown>
            </Menu>
    );
}

export function AddMagnet(props: AddCommonModalProps) {
    const serverData = useServerTorrentData();
    const [magnet, setMagnet] = useState<string>("");

    useEffect(() => {
        if (props.opened) {
            const uri = props.uris?.[0];
            if (typeof uri === "string") setMagnet(uri);
            else setMagnet("");
        }
    }, [props.uris, props.opened]);

    const [magnetData, setMagnetData] = useState<{ hash: string, trackers: string[] }>();

    useEffect(() => {
        setMagnetData(decodeMagnetLink(magnet));
    }, [magnet]);

    const [existingTorrent, setExistingTorrent] = useState<Torrent>();

    useEffect(() => {
        if (magnetData !== undefined && magnetData.hash !== "") {
            const torrent = serverData.torrents.find((t) => t.hashString === magnetData.hash);
            setExistingTorrent(torrent);
        } else {
            setExistingTorrent(undefined);
        }
    }, [serverData, props.serverName, magnetData]);

    const common = useCommonProps();
    const { close } = props;
    const addMutation = useAddTorrent(
        useCallback((response: any) => {
            const duplicate = response.arguments["torrent-duplicate"];
            if (duplicate !== undefined) {
                notifications.show({
                    title: "种子已经存在",
                    message: duplicate.name,
                    color: "green",
                });
            }
            const added = response.arguments["torrent-added"];
            if (added !== undefined) {
                notifications.show({
                    title: "种子已添加",
                    message: added.name,
                    color: "green",
                });
            }
        }, []),
        useCallback((e) => {
            console.error("种子添加失败:", e);
            notifications.show({
                title: "种子添加失败",
                message: String(e),
                color: "red",
            });
        }, []),
    );
    const mutateAddTrackers = useTorrentAddTrackers();

    const onAdd = useCallback(() => {
        const magnets1 = magnet.split("\n");
        let magnets : string[] = [];
        magnets1.forEach((m)=> {
            m = trim(m);
            if (m !== "")  magnets.push(m);
        })

        if (magnets.length === 0) return;

        let id = 1;
        props.setStatus(new RunStatus(false, "准备下载", magnets.map((m) => id++ + ": " + m).join("\n")));

        if (existingTorrent === undefined) {
            let magnetAsyncTasks: (() => Promise<void>)[] = [];
            let index = 1;
            magnets.forEach((m)=> {
                magnetAsyncTasks.push(
                    () => new Promise((resolve, reject) => {
                        const title = "队列下载中 " + index + "/" + magnets.length;
                        const last = index >= magnets.length;
                        index++;

                        props.setStatus(new RunStatus(false, title));
                        const updateFn = () => {
                            if (last || !common.props.delay || common.props.delayTime <= 0) {
                                resolve();
                            } else {
                                let times = common.props.delayTime;
                                let timer = setInterval(() => {
                                    props.setStatus(new RunStatus(false, title + " - 等待 " + times + " 秒"));
                                    if (times-- == 0) {
                                        clearInterval(timer);
                                        resolve();
                                    }
                                }, 1000);
                            }
                        }

                        addMutation.mutate(
                        {
                            url: trim(m),
                            downloadDir: common.location.path,
                            labels: common.props.labels,
                            paused: !common.start,
                            priority: common.priority,
                        },{
                            onSuccess: updateFn,
                            onError: updateFn,
                        }
                    )})
                );
            })
            magnetAsyncTasks.reduce(
                (promiseChain, currentTask) => promiseChain.then(currentTask),
                Promise.resolve()
            ).then(() => {
                props.setStatus(new RunStatus(false, "队列下载完成"));
                setTimeout(() => props.setStatus(new RunStatus(true)), 3000);
            });
            common.location.addPath(common.location.path);
        } else {
            mutateAddTrackers(
                { torrentId: existingTorrent.id, trackers: magnetData?.trackers ?? [] },
                {
                    onSuccess: () => {
                        notifications.show({
                            message: "服务器 Tracker 更新",
                            color: "green",
                        });
                    },
                },
            );
        }
        setMagnet("");
        close();
    }, [existingTorrent, close, addMutation, magnet, common, mutateAddTrackers, magnetData, props.setStatus]);

    const config = useContext(ConfigContext);
    const shouldOpen = !config.values.interface.skipAddDialog || typeof props.uris?.[0] !== "string";
    useEffect(() => {
        if (props.opened && !shouldOpen) {
            onAdd();
        }
    }, [onAdd, props.opened, shouldOpen]);

    return <>{props.opened && shouldOpen &&
        <HkModal opened={true} onClose={close} centered size="xl"
            styles={{ title: { flexGrow: 1 } }}
            title={<Flex w="100%" align="center" justify="space-between">
                <span>添加种子磁力链接或者URL</span>
                {TAURI && <TabSwitchDropdown tabsRef={props.tabsRef} />}
            </Flex>} >
            <Divider my="sm" />
            <Textarea
                minRows={10} wrap={"off"} style={ {overflow: "auto"} }
                label="磁力链接或者URL，一行一个" w="100%"
                value={magnet}
                onChange={(e) => { setMagnet(e.currentTarget.value); }}
                error={existingTorrent === undefined
                    ? undefined
                    : "种子已存在"} />
            <AddCommon {...common.props} isMagnet={true} disabled={existingTorrent !== undefined} />
            <Divider my="sm" />
            <Group position="center" spacing="md">
                <Button onClick={onAdd} variant="filled"
                    disabled={existingTorrent !== undefined && (magnetData?.trackers.length ?? 0) === 0}>
                    {existingTorrent === undefined ? "添加" : "添加 Tracker"}
                </Button>
                <Button onClick={props.close} variant="light">取消</Button>
            </Group>
        </HkModal>}
    </>;
}

async function readLocalTorrent(file: File): Promise<string> {
    return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const b64 = (reader.result as string).match(/data:[^/]*\/[^;]*;base64,(.*)/)?.[1];
            if (b64 === undefined) {
                throw Error("读取文件错误");
            }
            resolve(b64);
        };
        reader.readAsDataURL(file);
    });
}

function useTauriReadFile(
    props: AddCommonModalProps,
    torrentData: TorrentFileData[] | undefined,
    setTorrentData: React.Dispatch<React.SetStateAction<TorrentFileData[] | undefined>>,
) {
    useEffect(() => {
        if (TAURI && props.opened && torrentData === undefined) {
            const readFile = async (path: string | string[] | null) => {
                if (path == null) {
                    return undefined;
                }
                if (Array.isArray(path)) {
                    return await Promise.all(path.map(
                        async (p) => await invoke<TorrentFileData>("read_file", { path: p })));
                }
                return [await invoke<TorrentFileData>("read_file", { path })];
            };

            let uris = new Array<string>();
            props.uris?.forEach((uri) => {
                if (typeof uri === "string") {
                    if (uri.startsWith("file://")) {
                        uris.push(decodeURIComponent(uri.substring(7)));
                    } else {
                        uris.push(uri);
                    }
                }
            });

            const pathPromise = uris.length > 0
                ? Promise.resolve(uris)
                : dialogOpen({
                    title: "选择种子文件",
                    filters: [{
                        name: "Torrent(种子文件)",
                        extensions: ["torrent"],
                    }],
                    multiple: true,
                });

            pathPromise.then(readFile)
                .then((torrentData) => {
                    setTorrentData(torrentData);
                    if (torrentData === undefined) {
                        props.close();
                    }
                }).catch((e) => {
                    notifications.show({
                        title: "读取种子失败",
                        message: String(e),
                        color: "red",
                    });
                    props.close();
                });
        }
    }, [props, setTorrentData, torrentData]);
}

function useWebappReadFile(
    props: AddCommonModalProps,
    filesInputRef: React.RefObject<HTMLInputElement>,
    close: () => void,
    setTorrentData: React.Dispatch<React.SetStateAction<TorrentFileData[] | undefined>>,
) {
    useEffect(() => {
        if (!TAURI && props.opened) {
            if (props.uris === undefined || props.uris?.length <= 0) {
                if (filesInputRef.current != null) {
                    filesInputRef.current.value = "";
                    filesInputRef.current.click();
                }
                close();
            } else {
                const files = props.uris as Array<File>;
                Promise.all(files.map(readLocalTorrent)).then((filesData) => {
                    setTorrentData(filesData.map((b64, i) => ({
                        torrentPath: "",
                        metadata: b64,
                        name: files[i].name,
                        hash: "",
                        files: null,
                        trackers: [],
                        length: 0,
                    })));
                }).catch((e) => {
                    notifications.show({
                        title: "读取文件失败",
                        message: e,
                        color: "red",
                    });
                    close();
                });
            }
        }
    }, [props.opened, props.uris, close, filesInputRef, setTorrentData]);
}

function useFilesInput(
    filesInputRef: React.RefObject<HTMLInputElement>,
    close: () => void,
    setTorrentData: React.Dispatch<TorrentFileData[] | undefined>,
) {
    useEffect(() => {
        const input = filesInputRef.current;
        const fileInputListener = (e: Event) => {
            const element = e.target as HTMLInputElement;
            if (element.files == null) {
                close();
            } else {
                const files = [...element.files];
                Promise.all(files.map(readLocalTorrent)).then((filesData) => {
                    setTorrentData(filesData.map((b64, i) => ({
                        torrentPath: "",
                        metadata: b64,
                        name: files[i].name,
                        hash: "",
                        files: null,
                        trackers: [],
                        length: 0,
                    })));
                }).catch((e) => {
                    notifications.show({
                        title: "读取文件失败",
                        message: e,
                        color: "red",
                    });
                    close();
                });
            }
        };

        if (!TAURI) {
            input?.addEventListener("change", fileInputListener);
        }
        return () => {
            if (!TAURI) input?.removeEventListener("change", fileInputListener);
        };
    }, [close, filesInputRef, setTorrentData]);
}

interface TorrentFileData {
    torrentPath: string,
    metadata: string,
    name: string,
    hash: string,
    files: Array<{
        name: string,
        length: number,
    }> | null,
    trackers: string[],
    length: number,
}

export function AddTorrent(props: AddCommonModalProps) {
    const config = useContext(ConfigContext);
    const serverData = useServerTorrentData();
    const common = useCommonProps();
    const [torrentData, setTorrentData] = useState<TorrentFileData[]>();

    const existingTorrent = useMemo(() => {
        if (torrentData !== undefined && torrentData.length === 1) {
            return serverData.torrents.find((t) => t.hashString === torrentData[0].hash);
        }
        return undefined;
    }, [serverData.torrents, torrentData]);

    const { close } = props;

    const filesInputRef = useRef<HTMLInputElement>(null);

    useFilesInput(filesInputRef, close, setTorrentData);
    useWebappReadFile(props, filesInputRef, close, setTorrentData);
    useTauriReadFile(props, torrentData, setTorrentData);

    const fileTree = useMemo(() => new CachedFileTree(torrentData?.[0]?.hash ?? "", -1), [torrentData]);
    const [wantedSize, setWantedSize] = useState(0);

    const { data, refetch } = useFileTree("filetreebrief", fileTree);
    useEffect(() => {
        if (torrentData === undefined) return;

        if (torrentData.length === 1 && torrentData[0].files != null) {
            fileTree.parse(torrentData[0], true);
            setWantedSize(fileTree.getWantedSize());
            void refetch();
        } else {
            const totalSize = torrentData.reduce((total, { length }) => total + length, 0);
            setWantedSize(totalSize);
        }
    }, [torrentData, fileTree, refetch]);

    const unwantedHandler = useUnwantedFiles(fileTree, false);

    const onCheckboxChange = useCallback((entryPath: string, state: boolean) => {
        unwantedHandler(entryPath, state);
        setWantedSize(fileTree.getWantedSize());
    }, [fileTree, unwantedHandler]);

    const setAllWanted = useCallback((wanted: boolean) => {
        onCheckboxChange(fileTree.tree.fullpath, wanted);
        void refetch();
    }, [fileTree, onCheckboxChange, refetch]);

    const addMutation = useAddTorrent(
        useCallback((response: any, vars: TorrentAddQueryParams) => {
            const duplicate = response.arguments["torrent-duplicate"];
            if (duplicate !== undefined) {
                notifications.show({
                    title: "种子已存在",
                    message: duplicate.name,
                    color: "green",
                });
            }
            const added = response.arguments["torrent-added"];
            if (added !== undefined) {
                notifications.show({
                    title: "种子已添加",
                    message: added.name,
                    color: "green",
                });
            }
            if (TAURI && config.values.app.deleteAdded && vars.filePath !== undefined) {
                void invoke("remove_file", { path: vars.filePath });
            }
        }, [config.values.app.deleteAdded]),
        useCallback((e) => {
            console.error("种子添加失败:", e);
            notifications.show({
                title: "种子添加失败",
                message: String(e),
                color: "red",
            });
        }, []),
    );
    const mutateAddTrackers = useTorrentAddTrackers();

    const onAdd = useCallback(() => {
        if (torrentData === undefined) return;

        if (existingTorrent === undefined) {
            void Promise.all(torrentData.map(async (td) => {
                return await addMutation.mutateAsync(
                    {
                        metainfo: td.metadata,
                        downloadDir: common.location.path,
                        labels: common.props.labels,
                        paused: !common.start,
                        priority: common.priority,
                        unwanted: (td.files == null || torrentData.length > 1) ? undefined : fileTree.getUnwanted(),
                        filePath: td.torrentPath,
                    },
                );
            }));

            common.location.addPath(common.location.path);
        } else {
            mutateAddTrackers(
                { torrentId: existingTorrent.id, trackers: torrentData[0].trackers },
                {
                    onSuccess: () => {
                        notifications.show({
                            message: "服务器 Tracker 更新",
                            color: "green",
                        });
                    },
                    onSettled: () => {
                        if (TAURI && config.values.app.deleteAdded && torrentData[0].torrentPath !== undefined) {
                            void invoke("remove_file", { path: torrentData[0].torrentPath });
                        }
                    },
                },
            );
        }
        setTorrentData(undefined);
        close();
    }, [torrentData, existingTorrent, close, common, addMutation, fileTree, mutateAddTrackers, config]);

    const shouldOpen = !config.values.interface.skipAddDialog && torrentData !== undefined;
    useEffect(() => {
        if (torrentData !== undefined && !shouldOpen) {
            onAdd();
        }
    }, [onAdd, torrentData, shouldOpen]);

    const modalClose = useCallback(() => {
        setTorrentData(undefined);
        close();
    }, [close]);

    const names = useMemo(() => {
        if (torrentData === undefined) return [];

        return torrentData.map((td) => td.name);
    }, [torrentData]);

    const torrentExists = existingTorrent !== undefined;

    return (<>
        {!TAURI && <input ref={filesInputRef} type="file" accept=".torrent" multiple
            style={{ position: "absolute", top: "-20rem", zIndex: -1 }} />}
        {shouldOpen &&
            <HkModal opened={true} onClose={modalClose} centered size="xl"
                styles={{ title: { flexGrow: 1 } }}
                title={<Flex w="100%" align="center" justify="space-between">
                    <span>添加种子文件</span>
                    {TAURI && <TabSwitchDropdown tabsRef={props.tabsRef} />}
                </Flex>} >
                <Divider my="sm" />
                {torrentExists
                    ? <Text color="red" fw="bold" fz="lg">种子已存在</Text>
                    : <LimitedNamesList names={names} limit={5} />}
                <div style={{ position: "relative" }}>
                    <AddCommon {...common.props} disabled={torrentExists}>
                        {(wantedSize > 0 || torrentData[0].files != null) &&
                            <Text>{bytesToHumanReadableStr(wantedSize)}</Text>}
                        {(torrentData.length > 1 || torrentData[0].files == null)
                            ? <></>
                            : <>
                                <Button variant="subtle" disabled={torrentExists}
                                    onClick={() => { setAllWanted(true); }} title="选中所有文件">
                                    全选
                                </Button>
                                <Button variant="subtle" disabled={torrentExists}
                                    onClick={() => { setAllWanted(false); }} title="取消选中所有文件">
                                    全不选
                                </Button>
                            </>}
                    </AddCommon>
                    {(torrentData.length > 1 || torrentData[0].files == null)
                        ? <></>
                        : <Box w="100%" h="15rem">
                            <FileTreeTable
                                fileTree={fileTree}
                                data={data}
                                brief
                                onCheckboxChange={onCheckboxChange} />
                        </Box>
                    }
                </div>
                <Divider my="sm" />
                <Group position="center" spacing="md">
                    <Button onClick={onAdd} variant="filled" data-autofocus
                        disabled={torrentExists && torrentData[0].trackers.length === 0}>
                        {!torrentExists ? "添加" : "添加 Tracker"}
                    </Button>
                    <Button onClick={modalClose} variant="light">取消</Button>
                </Group>
            </HkModal >}
    </>);
}
