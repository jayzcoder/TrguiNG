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

import "css/torrenttable.css";
import React, { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Torrent } from "rpc/torrent";
import { useServerTorrentData, useServerRpcVersion, useServerSelectedTorrents } from "rpc/torrent";
import type { TorrentAllFieldsType, TorrentFieldsType } from "rpc/transmission";
import { PriorityColors, PriorityStrings, Status, StatusStrings, TorrentMinimumFields } from "rpc/transmission";
import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import {
    bytesToHumanReadableStr,
    ensurePathDelimiter,
    fileSystemSafeName,
    modKeyString,
    pathMapFromServer,
    secondsToHumanReadableStr,
    timestampToDateString
} from "trutil";
import type { ProgressBarVariant } from "../progressbar";
import { ProgressBar } from "../progressbar";
import type { AccessorFn, CellContext } from "@tanstack/table-core";
import type { TableSelectReducer } from "./common";
import { EditableNameField, TrguiTable } from "./common";
import { Badge, Box, Button, Kbd, Menu, Portal, Text, useMantineTheme } from "@mantine/core";
import { ConfigContext, ServerConfigContext } from "config";
import { StatusIconMap, Error as StatusIconError, Magnetizing, CompletedStopped } from "components/statusicons";
import { useMutateTorrentPath, useTorrentAction } from "queries";
import { notifications } from "@mantine/notifications";
import type { ContextMenuInfo } from "components/contextmenu";
import { ContextMenu, useContextMenu } from "components/contextmenu";
import type { ModalCallbacks } from "components/modals/servermodals";
import type { TorrentActionMethodsType } from "rpc/client";
import * as Icon from "react-bootstrap-icons";
import { useHotkeysContext } from "hotkeys";
const { TAURI, invoke, copyToClipboard } = await import(/* webpackChunkName: "taurishim" */"taurishim");
import {RunStatus} from "../../status";

interface TableFieldProps {
    torrent: Torrent,
    fieldName: TorrentAllFieldsType,
}

interface TableFieldSimple {
    name: TorrentFieldsType,
    label: string,
    component: React.FunctionComponent<TableFieldProps> | React.NamedExoticComponent<TableFieldProps>,
    requiredFields?: TorrentFieldsType[],
}

interface TableFieldWithAccessor extends TableFieldSimple {
    columnId: string,
    accessorFn: AccessorFn<Torrent>,
}

type TableField = TableFieldSimple | TableFieldWithAccessor;

function isTableFieldWithAccessor(f: TableField): f is TableFieldWithAccessor {
    return (f as TableFieldWithAccessor).accessorFn !== undefined;
}

const TimeField = memo(function TimeField(props: TableFieldProps) {
    if (props.fieldName in props.torrent) {
        return <div>{secondsToHumanReadableStr(props.torrent[props.fieldName])}</div>;
    } else {
        return <></>;
    }
}, (prev, next) => {
    const previousValue = prev.torrent[prev.fieldName] as number;
    const nextValue = next.torrent[next.fieldName] as number;
    return Math.abs((previousValue - nextValue) / nextValue) < 1 / 60 / 60;
});

const AllFields: readonly TableField[] = [
    {
        name: "name",
        label: "名称",
        component: NameField,
        requiredFields: ["name", "error", "trackerStats", "leftUntilDone"] as TorrentFieldsType[],
    },
    { name: "totalSize", label: "总大小", component: ByteSizeField },
    { name: "sizeWhenDone", label: "选定大小", component: ByteSizeField },
    { name: "leftUntilDone", label: "剩余", component: ByteSizeField },
    { name: "haveValid", label: "有效", component: ByteSizeField },
    { name: "downloadedEver", label: "已下载", component: ByteSizeField },
    { name: "uploadedEver", label: "已上传", component: ByteSizeField },
    {
        name: "uploadedEver",
        label: "已上传/已下载",
        component: UploadRatioField,
        accessorFn: (t) => t.uploadedEver === 0 ? 0 : t.uploadedEver / t.downloadedEver,
        columnId: "simpleRatio",
        requiredFields: ["uploadedEver", "downloadedEver"] as TorrentFieldsType[],
    },
    {
        name: "percentDone",
        label: "进度",
        component: PercentBarField,
        requiredFields: ["percentDone", "rateDownload", "rateUpload"] as TorrentFieldsType[],
    },
    { name: "rateDownload", label: "下载速度", component: ByteRateField },
    { name: "rateUpload", label: "上传速度", component: ByteRateField },
    { name: "status", label: "状态", component: StatusField },
    { name: "addedDate", label: "添加时间", component: DateField },
    {
        name: "peersSendingToUs",
        label: "种子|活跃",
        component: SeedsField,
        columnId: "peersSendingToUs",
        accessorFn: (t) => t.peersSendingToUs * 1e+6 + t.cachedSeedsTotal,
    },
    {
        name: "peersGettingFromUs",
        label: "下载|活跃",
        component: PeersField,
        columnId: "peersGettingFromUs",
        accessorFn: (t) => t.peersGettingFromUs * 1e+6 + t.cachedPeersTotal,
    },
    { name: "eta", label: "剩余时间", component: EtaField },
    { name: "uploadRatio", label: "分享率", component: FixedDecimalField },
    {
        name: "trackerStats",
        label: "服务器",
        component: TrackerField,
        columnId: "tracker",
        accessorFn: (t) => t.cachedMainTracker,
    },
    {
        name: "trackerStats",
        label: "服务器状态",
        component: TrackerStatusField,
        columnId: "trackerStatus",
        accessorFn: (t) => t.cachedTrackerStatus,
    },
    { name: "doneDate", label: "完成时间", component: DateField },
    { name: "activityDate", label: "最后活动时间", component: DateDiffField },
    { name: "downloadDir", label: "保存目录", component: StringField },
    { name: "bandwidthPriority", label: "优先级", component: PriorityField },
    { name: "id", label: "ID", component: StringField },
    { name: "queuePosition", label: "队列位置", component: PositiveNumberField },
    { name: "secondsSeeding", label: "做种时长", component: TimeField },
    { name: "isPrivate", label: "私有", component: StringField },
    { name: "labels", label: "用户标签", component: LabelsField },
    { name: "group", label: "备用带宽", component: StringField },
    { name: "file-count", label: "文件数目", component: PositiveNumberField },
    { name: "pieceCount", label: "块数目", component: PositiveNumberField },
    { name: "metadataPercentComplete", label: "元数据", component: PercentBarField },
] as const;

function NameField(props: TableFieldProps) {
    let StatusIcon = StatusIconMap[props.torrent.status];
    if (props.torrent.status === Status.downloading && props.torrent.pieceCount === 0) {
        StatusIcon = Magnetizing;
    }
    if (props.torrent.status === Status.stopped &&
        props.torrent.sizeWhenDone > 0 &&
        props.torrent.leftUntilDone === 0) {
        StatusIcon = CompletedStopped;
    }

    if ((props.torrent.error !== undefined && props.torrent.error > 0) ||
        props.torrent.cachedError !== "") {
        StatusIcon = StatusIconError;
    }

    const currentName = useMemo(() => props.torrent[props.fieldName], [props.fieldName, props.torrent]);

    const mutation = useMutateTorrentPath();

    const updateTorrentName = useCallback((name: string, onStart: () => void, onEnd: () => void) => {
        onStart();
        const path = fileSystemSafeName(props.torrent.name);
        name = fileSystemSafeName(name);
        if (name === path) {
            onEnd();
        } else {
            mutation.mutate(
                { torrentId: props.torrent.id, path, name },
                {
                    onSettled: onEnd,
                    onError: () => { notifications.show({ color: "red", message: "Failed to rename torrent" }); },
                });
        }
    }, [mutation, props.torrent.id, props.torrent.name]);

    const rpcVersion = useServerRpcVersion();

    return (
        <EditableNameField currentName={currentName} onUpdate={rpcVersion >= 15 ? updateTorrentName : undefined}>
            <Box pb="xs" className="icon-container">
                <StatusIcon />
            </Box>
        </EditableNameField>
    );
}

function StringField(props: TableFieldProps) {
    return (
        <div>
            {props.torrent[props.fieldName]}
        </div>
    );
}

function PositiveNumberField(props: TableFieldProps) {
    const num = props.torrent[props.fieldName];
    return (
        <div style={{ width: "100%", textAlign: "right" }}>
            {num < 0 ? "" : num}
        </div>
    );
}

function FixedDecimalField(props: TableFieldProps) {
    const num = props.torrent[props.fieldName];
    return (
        <div style={{ width: "100%", textAlign: "right" }}>
            {num < 0 ? "" : Number(num).toFixed(2)}
        </div>
    );
}

function UploadRatioField(props: TableFieldProps) {
    return (
        <div style={{ width: "100%", textAlign: "right" }}>
            {props.torrent.uploadedEver === 0
                ? "-"
                : props.torrent.downloadedEver === 0
                    ? "∞"
                    : (props.torrent.uploadedEver / props.torrent.downloadedEver).toFixed(2)}
        </div>
    );
}

function SeedsField(props: TableFieldProps) {
    const sending = props.torrent.peersSendingToUs as number;
    const totalSeeds = props.torrent.cachedSeedsTotal;
    return (
        <div style={{ width: "100%", textAlign: "right" }}>
            {totalSeeds < 0 ? `${sending}` : `${totalSeeds} (${sending})`}
        </div>
    );
}

function PeersField(props: TableFieldProps) {
    const getting = props.torrent.peersGettingFromUs as number;
    const totalPeers = props.torrent.cachedPeersTotal;
    return (
        <div style={{ width: "100%", textAlign: "right" }}>
            {totalPeers < 0 ? `${getting}` : `${totalPeers} (${getting})`}
        </div>
    );
}

export function EtaField(props: TableFieldProps) {
    const seconds = props.torrent[props.fieldName];
    if (seconds >= 0) return <TimeField {...props} />;
    else if (seconds === -1) return <></>;
    else return <div>∞</div>;
}

export function TrackerField(props: TableFieldProps) {
    return <div>{props.torrent.cachedMainTracker}</div>;
}

function TrackerStatusField(props: TableFieldProps) {
    return <div>{props.torrent.cachedTrackerStatus}</div>;
}

function PriorityField(props: TableFieldProps) {
    const priority = props.torrent[props.fieldName];
    return <Badge radius="md" variant="filled" bg={PriorityColors.get(priority)}>{PriorityStrings.get(priority)}</Badge>;
}

export function LabelsField(props: TableFieldProps) {
    const labels: string[] | undefined = props.torrent.labels;
    return <>
        {labels?.map((label) => <Badge key={label}
            radius="md" variant="filled" className="torrent-label white-outline">
            {label}
        </Badge>)}
    </>;
}

export function StatusField(props: TableFieldProps) {
    let status: string = StatusStrings[props.torrent.status];
    if (props.torrent.status === Status.downloading && props.torrent.pieceCount === 0) status = "Magnetizing";

    const sequential = (props.torrent.status === Status.downloading && props.torrent.sequentialDownload === true) ? " sequentially" : "";
    return <div>{status + sequential}</div>;
}

export function DateField(props: TableFieldProps) {
    const date = props.torrent[props.fieldName] > 0
        ? timestampToDateString(props.torrent[props.fieldName])
        : "";
    return <div>{date}</div>;
}

export function DateDiffField(props: TableFieldProps) {
    const date = props.torrent[props.fieldName] > 0
        ? timestampToDateString(props.torrent[props.fieldName])
        : "";
    const seconds = Math.floor(Date.now() / 1000) - props.torrent[props.fieldName];
    return <div title={date} style={{ width: "100%", textAlign: "right" }}>
        {seconds < 30
            ? "now"
            : date === "" ? "" : `${secondsToHumanReadableStr(seconds)} ago`}
    </div>;
}

function ByteSizeField(props: TableFieldProps) {
    const field = props.torrent[props.fieldName];
    const stringValue = useMemo(() => {
        return bytesToHumanReadableStr(field);
    }, [field]);

    return <div style={{ width: "100%", textAlign: "right" }}>{stringValue}</div>;
}

function ByteRateField(props: TableFieldProps) {
    const field = props.torrent[props.fieldName];
    const stringValue = useMemo(() => {
        return field > 0 ? `${bytesToHumanReadableStr(field)}/s` : "";
    }, [field]);

    return <div style={{ width: "100%", textAlign: "right" }}>{stringValue}</div>;
}

function PercentBarField(props: TableFieldProps) {
    const config = useContext(ConfigContext);
    const now = props.torrent[props.fieldName] * 100;
    const active = props.torrent.rateDownload > 0 || props.torrent.rateUpload > 0;
    let variant: ProgressBarVariant = "default";
    if (config.values.interface.progressbarStyle === "多颜色") {
        if ((props.torrent.error !== undefined && props.torrent.error > 0) ||
            props.torrent.cachedError !== "") variant = "red";
        else {
            if (active) variant = "green";
            else if (props.torrent.status === Status.stopped &&
                props.torrent.sizeWhenDone > 0 &&
                props.torrent.leftUntilDone === 0) variant = "dark-green";
        }
    }

    return <ProgressBar
        now={now}
        className="white-outline"
        animate={config.values.interface.progressbarStyle === "动态" && active}
        variant={variant} />;
}

const Columns = AllFields.map((f): ColumnDef<Torrent> => {
    const cell = (props: CellContext<Torrent, unknown>) => {
        return <f.component fieldName={f.name} torrent={props.row.original} />;
    };
    if (isTableFieldWithAccessor(f)) {
        return {
            header: f.label,
            accessorFn: f.accessorFn,
            id: f.columnId,
            cell,
        };
    }
    return {
        header: f.label,
        accessorKey: f.name,
        cell,
    };
});

const ColumnRequiredFields = AllFields.map(
    (f) => ({
        id: (f as TableFieldWithAccessor).columnId ?? f.name,
        requires: f.requiredFields ?? [f.name],
    }),
);

function getRequiredFields(visibilityState: VisibilityState): TorrentFieldsType[] {
    const set = ColumnRequiredFields.reduce(
        (set: Set<TorrentFieldsType>, f) => {
            if (!(f.id in visibilityState) || visibilityState[f.id]) {
                f.requires.forEach((r) => set.add(r));
            }
            return set;
        },
        new Set<TorrentFieldsType>());

    // add bare minimum fields
    TorrentMinimumFields.forEach((f) => set.add(f));
    if (TAURI) set.add("hashString");

    return Array.from(set).sort();
}

export function useInitialTorrentRequiredFields() {
    const config = useContext(ConfigContext);

    return useMemo(
        () => getRequiredFields(config.getTableColumnVisibility("torrents")),
        [config]);
}

export function TorrentTable(props: {
    modals: React.RefObject<ModalCallbacks>,
    torrents: Torrent[],
    setCurrentTorrent: (id: string) => void,
    selectedReducer: TableSelectReducer,
    onColumnVisibilityChange: React.Dispatch<TorrentFieldsType[]>,
    scrollToRow?: { id: string },
    setStatus: (status: RunStatus) => void,
}) {
    const serverConfig = useContext(ServerConfigContext);

    const getRowId = useCallback((t: Torrent) => String(t.id), []);

    const { onColumnVisibilityChange } = props;
    const onVisibilityChange = useCallback(
        (visibility: VisibilityState) => { onColumnVisibilityChange(getRequiredFields(visibility)); },
        [onColumnVisibilityChange],
    );

    const onRowDoubleClick = useCallback((torrent: Torrent, reveal: boolean = false) => {
        if (TAURI) {
            if (torrent.downloadDir === undefined || torrent.downloadDir === "") return;
            let path = torrent.downloadDir as string;
            if (!path.endsWith("/") && !path.endsWith("\\")) {
                path = path + "/";
            }
            path = path + fileSystemSafeName(torrent.name);
            path = pathMapFromServer(path, serverConfig);
            invoke("shell_open", { path, reveal }).catch((e) => {
                notifications.show({
                    title: "打开失败",
                    message: path,
                    color: "red",
                });
            });
        } else {
            props.modals.current?.editTorrent();
        }
    }, [props.modals, serverConfig]);

    const serverSelected = useServerSelectedTorrents();
    const selected = useMemo(() => Array.from(serverSelected).map(String), [serverSelected]);

    const [info, setInfo, handler] = useContextMenu();

    return (
        <Box w="100%" h="100%" onContextMenu={handler}>
            <MemoizedTorrentContextMenu
                contextMenuInfo={info}
                setContextMenuInfo={setInfo}
                modals={props.modals}
                onRowDoubleClick={onRowDoubleClick}
                setStatus={props.setStatus}/>
            <TrguiTable<Torrent> {...{
                tablename: "torrents",
                columns: Columns,
                data: props.torrents,
                getRowId,
                selected: selected,
                selectedReducer: props.selectedReducer,
                setCurrent: props.setCurrentTorrent,
                onVisibilityChange,
                onRowDoubleClick,
                scrollToRow: props.scrollToRow,
            }} />
        </Box>
    );
}

function TorrentContextMenu(props: {
    contextMenuInfo: ContextMenuInfo,
    setContextMenuInfo: (i: ContextMenuInfo) => void,
    modals: React.RefObject<ModalCallbacks>,
    onRowDoubleClick: (t: Torrent, reveal: boolean) => void,
    setStatus: (status: RunStatus) => void,
}) {
    const serverData = useServerTorrentData();
    const serverSelected = useServerSelectedTorrents();
    const rpcVersion = useServerRpcVersion();

    const { onRowDoubleClick } = props;
    const onOpen = useCallback((reveal: boolean) => {
        const torrent = serverData.torrents.find((t) => t.id === serverData.current);
        if (torrent === undefined) return;
        onRowDoubleClick(torrent, reveal);
    }, [onRowDoubleClick, serverData]);

    const mutate = useTorrentAction();

    const torrentAction = useCallback((method: TorrentActionMethodsType, successMessage: string) => {
        mutate(
            {
                method,
                torrentIds: Array.from(serverSelected),
            },
            {
                onSuccess: () => {
                    notifications.show({
                        message: successMessage,
                        color: "green",
                    });
                },
            },
        );
    }, [mutate, serverSelected]);

    const [queueSubmenuOpened, setQueueSubmenuOpened] = useState(false);
    const queueRef = useRef<HTMLButtonElement>(null);
    const [queueItemRect, setQueueItemRect] = useState<DOMRect>(() => new DOMRect(0, -100, 0, 0));

    const openQueueSubmenu = useCallback(() => {
        if (queueRef.current == null || serverSelected.size === 0) return;
        setQueueItemRect(queueRef.current.getBoundingClientRect());
        setQueueSubmenuOpened(true);
    }, [serverSelected]);

    const closeQueueSubmenu = useCallback(() => {
        setQueueSubmenuOpened(false);
        setQueueItemRect(new DOMRect(0, -100, 0, 0));
    }, []);

    const copyNames = useCallback(() => {
        if (serverSelected.size === 0) return;

        let names = new Map<string, number>();
        serverData.torrents.forEach((t) => {
            if (serverSelected.has(t.id)) {
                if (!names.has(t.name)) names.set(t.name, 0);
            }
        });

        copyToClipboard(Array.from(names.keys()).join("\n"));

        notifications.show({
            message: `名称已复制到剪切板`,
            color: "green",
        });
    }, [serverData.torrents, serverSelected]);

    const copyPaths = useCallback(() => {
        if (serverSelected.size === 0) return;

        let paths = new Map<string, number>();
        serverData.torrents.forEach((t) => {
            const path = ensurePathDelimiter(t.downloadDir) + fileSystemSafeName(t.name);
            if (serverSelected.has(t.id)) {
                if (!paths.has(path)) paths.set(path, 0);
            }
        });

        copyToClipboard(Array.from(paths.keys()).join("\n"));

        notifications.show({
            message: `路径已复制到剪切板`,
            color: "green",
        });
    }, [serverData.torrents, serverSelected]);

    const copyMagnetLinks = useCallback(() => {
        if (serverSelected.size === 0) return;

        const links = serverData.torrents
            .filter((t) => serverSelected.has(t.id))
            .map((t) => t.magnetLink);

        copyToClipboard(links.join("\n"));

        notifications.show({
            message: `磁力链接已复制到剪切板`,
            color: "green",
        });
    }, [serverData.torrents, serverSelected]);

    const hk = useHotkeysContext();

    useEffect(() => {
        hk.handlers.copyToClipboard = copyNames;
        return () => { hk.handlers.copyToClipboard = () => { }; };
    }, [copyNames, hk]);

    const theme = useMantineTheme();

    return (<>
        <Menu
            openDelay={100}
            closeDelay={400}
            opened={queueSubmenuOpened}
            onChange={setQueueSubmenuOpened}
            middlewares={{ shift: true, flip: true }}
            position="right-start"
            zIndex={301}
        >
            <Portal>
                <Box
                    onMouseDown={closeQueueSubmenu}
                    sx={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        height: "100vh",
                        width: "100vw",
                        zIndex: queueSubmenuOpened ? 100 : -1,
                    }} />
                <Menu.Target>
                    <Button unstyled
                        sx={{
                            position: "absolute",
                            border: 0,
                            padding: 0,
                            background: "transparent",
                        }}
                        style={{
                            left: queueItemRect.x,
                            top: queueItemRect.y,
                            width: `calc(${queueItemRect.width}px + 0.5em)`,
                            height: queueItemRect.height,
                        }} />
                </Menu.Target>
                <Menu.Dropdown miw="10rem">
                    <Menu.Item
                        onClick={() => { torrentAction("queue-move-top", "队列已更新"); }}
                        icon={<Icon.ChevronDoubleUp size="1.1rem" />}>
                        队列排到最前
                    </Menu.Item>
                    <Menu.Item
                        onClick={() => { torrentAction("queue-move-up", "队列已更新"); }}
                        icon={<Icon.ChevronUp size="1.1rem" />}>
                        队列向上移动
                    </Menu.Item>
                    <Menu.Item
                        onClick={() => { torrentAction("queue-move-down", "队列已更新"); }}
                        icon={<Icon.ChevronDown size="1.1rem" />}>
                        队列向下移动
                    </Menu.Item>
                    <Menu.Item
                        onClick={() => { torrentAction("queue-move-bottom", "队列已更新"); }}
                        icon={<Icon.ChevronDoubleDown size="1.1rem" />}>
                        队列排到最后
                    </Menu.Item>
                </Menu.Dropdown>
            </Portal>
        </Menu>
        <ContextMenu contextMenuInfo={props.contextMenuInfo} setContextMenuInfo={props.setContextMenuInfo}>
            <Box miw="14rem">
                {TAURI && <>
                    <Menu.Item
                        onClick={() => { onOpen(false); }}
                        onMouseEnter={closeQueueSubmenu}
                        icon={<Icon.BoxArrowUpRight size="1.1rem" />}
                        disabled={serverData.current === undefined}>
                        <Text weight="bold">打开文件</Text>
                    </Menu.Item>
                    <Menu.Item
                        onClick={() => { onOpen(true); }}
                        onMouseEnter={closeQueueSubmenu}
                        icon={<Icon.Folder2Open size="1.1rem" />}
                        disabled={serverData.current === undefined}>
                        <Text>打开目录</Text>
                    </Menu.Item>
                    <Menu.Divider />
                </>}
                <Menu.Item
                    onClick={() => { torrentAction("torrent-start-now", "强制开始"); }}
                    onMouseEnter={closeQueueSubmenu}
                    icon={<Icon.LightningFill size="1.1rem" />}
                    disabled={serverSelected.size === 0}>
                    强制开始选中的种子
                </Menu.Item>
                <Menu.Item
                    onClick={() => { torrentAction("torrent-start", "开始"); }}
                    onMouseEnter={closeQueueSubmenu}
                    icon={<Icon.PlayCircleFill size="1.1rem" />}
                    rightSection={<Kbd>F3</Kbd>}
                    disabled={serverSelected.size === 0}>
                    开始选中的种子
                </Menu.Item>
                <Menu.Item
                    onClick={() => { torrentAction("torrent-stop", "暂停"); }}
                    onMouseEnter={closeQueueSubmenu}
                    icon={<Icon.PauseCircleFill size="1.1rem" />}
                    rightSection={<Kbd>F4</Kbd>}
                    disabled={serverSelected.size === 0}>
                    暂停选中的种子
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                    onClick={() => props.modals.current?.remove()}
                    onMouseEnter={closeQueueSubmenu}
                    icon={<Icon.XCircleFill size="1.1rem" color={theme.colors.red[6]} />}
                    disabled={serverSelected.size === 0}
                    rightSection={<Kbd>del</Kbd>}>
                    删除选中的任务
                </Menu.Item>
                <Menu.Item
                    onClick={() => { torrentAction("torrent-verify", "开始校验"); }}
                    onMouseEnter={closeQueueSubmenu}
                    icon={<Icon.CheckAll size="1.1rem" />}
                    disabled={serverSelected.size === 0}>
                    重新校验选中的种子
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                    onClick={() => { torrentAction("torrent-reannounce", "重新汇报"); }}
                    onMouseEnter={closeQueueSubmenu}
                    icon={<Icon.Wifi size="1.1rem" />}
                    disabled={serverSelected.size === 0}>
                    重新汇报(获取更多Peer)
                </Menu.Item>
                <Menu.Item
                    onClick={() => props.modals.current?.move()}
                    onMouseEnter={closeQueueSubmenu}
                    icon={<Icon.FolderFill size="1.1rem" />}
                    disabled={serverSelected.size === 0}
                    rightSection={<Kbd>F6</Kbd>}>
                    变更数据保存目录
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                    onClick={copyNames}
                    onMouseEnter={closeQueueSubmenu}
                    icon={<Icon.ClipboardCheckFill size="1.1rem" />}
                    disabled={serverSelected.size === 0}
                    rightSection={<Kbd>{`${modKeyString()} C`}</Kbd>}>
                    复制选中种子的名称
                </Menu.Item>
                <Menu.Item
                    onClick={copyPaths}
                    onMouseEnter={closeQueueSubmenu}
                    icon={<Icon.ClipboardCheckFill size="1.1rem" />}
                    disabled={serverSelected.size === 0}>
                    复制选中种子的路径
                </Menu.Item>
                <Menu.Item
                    onClick={copyMagnetLinks}
                    onMouseEnter={closeQueueSubmenu}
                    icon={<Icon.MagnetFill size="1.1rem" />}
                    disabled={serverSelected.size === 0}>
                    复制选中种子的磁力链接
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item ref={queueRef}
                    icon={<Icon.ThreeDots size="1.1rem" />}
                    rightSection={<Icon.ChevronRight size="0.8rem" />}
                    onMouseEnter={openQueueSubmenu}
                    disabled={serverSelected.size === 0}>
                    队列
                </Menu.Item>
                <Menu.Item
                    onClick={() => props.modals.current?.setLabels()}
                    onMouseEnter={closeQueueSubmenu}
                    icon={<Icon.TagsFill size="1.1rem" />}
                    disabled={serverSelected.size === 0}
                    rightSection={<Kbd>F7</Kbd>}>
                    设置用户标签
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                    onClick={() => props.modals.current?.editTrackers()}
                    icon={<Icon.Wifi size="1.1rem" />}
                    onMouseEnter={closeQueueSubmenu}
                    disabled={serverSelected.size === 0}>
                    修改Tracker...
                </Menu.Item>
                <Menu.Item
                    onClick={() => props.modals.current?.editTorrent()}
                    icon={<Icon.GearFill size="1.1rem" />}
                    onMouseEnter={closeQueueSubmenu}
                    disabled={serverSelected.size === 0}>
                    修改限速等限制属性...
                </Menu.Item>
            </Box>
        </ContextMenu>
    </>);
}

const MemoizedTorrentContextMenu = memo(TorrentContextMenu);
