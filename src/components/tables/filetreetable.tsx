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

import React, { useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Row, ColumnDef, CellContext } from "@tanstack/react-table";
import type { CachedFileTree, FileDirEntryView } from "../../cachedfiletree";
import { isDirEntry } from "../../cachedfiletree";
import { ConfigContext, ServerConfigContext } from "../../config";
import { PriorityColors, PriorityStrings } from "../../rpc/transmission";
import { bytesToHumanReadableStr, fileSystemSafeName, pathMapFromServer } from "../../trutil";
import type { ProgressBarVariant } from "../progressbar";
import { ProgressBar } from "../progressbar";
import * as Icon from "react-bootstrap-icons";
import type { TrguiTableRef } from "./common";
import { EditableNameField, TrguiTable } from "./common";
import { ActionIcon, Badge, Box, Checkbox, Flex, Loader, Menu, Text, TextInput, useMantineTheme } from "@mantine/core";
import { refreshFileTree, useMutateTorrent, useMutateTorrentPath } from "queries";
import { notifications } from "@mantine/notifications";
import type { ContextMenuInfo } from "components/contextmenu";
import { ContextMenu, useContextMenu } from "components/contextmenu";
import { useHotkeysContext } from "hotkeys";
import debounce from "lodash-es/debounce";
import { useServerRpcVersion } from "rpc/torrent";
import { FileIcon } from "components/fileicon";
const { TAURI, invoke } = await import(/* webpackChunkName: "taurishim" */"taurishim");

type FileDirEntryKey = keyof FileDirEntryView;
type EntryWantedChangeHandler = (entryPath: string, state: boolean) => void;

interface TableFieldProps {
    fileTree: CachedFileTree,
    entry: FileDirEntryView,
    row: Row<FileDirEntryView>,
    fieldName: FileDirEntryKey,
    treeName: string,
    onCheckboxChange: EntryWantedChangeHandler,
}

interface TableField {
    name: FileDirEntryKey,
    label: string,
    component: React.FunctionComponent<TableFieldProps>,
    briefField?: boolean,
}

const AllFields: readonly TableField[] = [
    { name: "name", label: "名称", component: NameField, briefField: true },
    { name: "size", label: "总大小", component: ByteSizeField, briefField: true },
    { name: "done", label: "已下载", component: ByteSizeField },
    { name: "percent", label: "进度", component: PercentBarField },
    { name: "priority", label: "优先级", component: PriorityField },
] as const;

function NameField(props: TableFieldProps) {
    const { entry, fileTree } = props;
    const isDir = entry.subrows.length > 0;

    const onToggleExpand = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        props.row.toggleExpanded();
    }, [props]);

    const theme = useMantineTheme();

    const mutation = useMutateTorrentPath();

    const updatePath = useCallback((name: string, onStart: () => void, onEnd: () => void) => {
        onStart();
        name = fileSystemSafeName(name);

        mutation.mutate(
            { torrentId: fileTree.torrentId, path: props.entry.fullpath, name },
            {
                onSettled: onEnd,
                onError: () => { notifications.show({ color: "red", message: "Failed to update file path" }); },
                onSuccess: () => {
                    fileTree.updatePath(props.entry.fullpath, name);
                    refreshFileTree(props.treeName);
                },
            });
    }, [mutation, fileTree, props.entry.fullpath, props.treeName]);

    const rpcVersion = useServerRpcVersion();

    const onArrowLeftRight = useCallback((key: string) => {
        if (props.row.subRows.length === 0) return;
        if (key === "ArrowLeft" && props.row.getIsExpanded()) props.row.toggleExpanded();
        if (key === "ArrowRight" && !props.row.getIsExpanded()) props.row.toggleExpanded();
    }, [props.row]);

    return (
        <EditableNameField currentName={props.entry.name} onArrowLeftRight={onArrowLeftRight}
            onUpdate={(props.treeName === "filetree" && rpcVersion >= 15) ? updatePath : undefined}>
            <Box sx={{ width: `${props.entry.level * 1.6}rem`, flexShrink: 0 }} />
            <Box w="1.4rem" mx="auto" sx={{ flexShrink: 0 }}>
                {props.entry.wantedUpdating
                    ? <Loader size="1.2rem" color={theme.colorScheme === "dark" ? theme.colors.cyan[4] : theme.colors.cyan[9]} />
                    : <Checkbox
                        checked={props.entry.want === true || props.entry.want === undefined}
                        indeterminate={props.entry.want === undefined}
                        onChange={(e) => {
                            props.onCheckboxChange(props.entry.fullpath, e.currentTarget.checked);
                            refreshFileTree(props.treeName);
                        }}
                        onClick={(e) => { e.stopPropagation(); }}
                        onDoubleClick={(e) => { e.stopPropagation(); }} />
                }
            </Box>
            <Box ml="xs" className="icon-container">
                {isDir
                    ? props.row.getIsExpanded()
                        ? <Icon.DashSquare size="1.1rem" onClick={onToggleExpand} style={{ cursor: "pointer" }} />
                        : <Icon.PlusSquare size="1.1rem" onClick={onToggleExpand} style={{ cursor: "pointer" }} />
                    : <FileIcon name={props.entry.name} />
                }
            </Box>
        </EditableNameField>
    );
}

function ByteSizeField(props: TableFieldProps) {
    const stringValue = useMemo(() => {
        return bytesToHumanReadableStr(props.entry[props.fieldName] as number);
    }, [props]);

    return <div>{stringValue}</div>;
}

function PercentBarField(props: TableFieldProps) {
    const config = useContext(ConfigContext);
    const now = props.entry.percent ?? 0;
    let variant: ProgressBarVariant = "default";
    if (config.values.interface.progressbarStyle === "多颜色") {
        if (props.entry.want === false) variant = "grey";
        else if (now === 100) variant = "dark-green";
    }

    return <ProgressBar now={now} className="white-outline" variant={variant} />;
}

function PriorityField(props: TableFieldProps) {
    const priority = props.entry.priority;
    return <Badge
        radius="md"
        variant="filled"
        bg={priority === undefined ? "gray" : PriorityColors.get(priority)}>
        {priority === undefined ? "mixed" : PriorityStrings.get(priority)}
    </Badge>;
}

interface FileTreeTableProps {
    fileTree: CachedFileTree,
    data: FileDirEntryView[],
    onCheckboxChange: EntryWantedChangeHandler,
    downloadDir?: string,
    brief?: boolean,
}

function entryMatchesSearchTerms(entry: FileDirEntryView, searchTerms: string[]) {
    const path = entry.fullpath.toLowerCase().substring(entry.fullpath.indexOf("/") + 1);
    return searchTerms.every(term => path.includes(term));
}

export function useUnwantedFiles(ft: CachedFileTree, setUpdating: boolean): EntryWantedChangeHandler {
    const changeHandler = useCallback((entryPath: string, state: boolean) => {
        ft.setWanted(entryPath, state, setUpdating);
    }, [ft, setUpdating]);

    return changeHandler;
}

function useSelected(data: FileDirEntryView[], fileTree: CachedFileTree, searchTerms: string[]) {
    const [selected, setSelected] = useReducer((prev: string[], next: string[]) => {
        if (prev.length === next.length) {
            for (let i = 0; i < prev.length; i++) {
                if (prev[i] !== next[i]) return next;
            }
            return prev;
        }
        return next;
    }, []);

    const deriveNewSelection = useRef((_: boolean) => [] as string[]);
    deriveNewSelection.current = useCallback((selectAll: boolean) => {
        const result: string[] = [];
        const recurse = (entry: FileDirEntryView) => {
            if (
                (selectAll || fileTree.findEntry(entry.fullpath)?.isSelected === true) &&
                (entry.subrows.length === 0 || entryMatchesSearchTerms(entry, searchTerms))
            ) {
                result.push(entry.fullpath);
                return;
            }
            entry.subrows.forEach(recurse);
        };
        data.forEach(recurse);
        return result;
    }, [data, fileTree, searchTerms]);

    useEffect(() => {
        if (searchTerms.length === 0) return;

        fileTree.selectAction({ verb: "set", ids: deriveNewSelection.current(false) });
        setSelected(fileTree.getSelected());
    }, [fileTree, searchTerms]);

    const selectAll = useRef(() => { });
    const hk = useHotkeysContext();

    selectAll.current = useCallback(() => {
        fileTree.selectAction({ verb: "set", ids: deriveNewSelection.current(true) });
        setSelected(fileTree.getSelected());
    }, [fileTree]);

    useEffect(() => {
        return () => { hk.handlers.selectAll = () => { }; };
    }, [hk]);

    const selectedReducer = useCallback((action: { verb: "add" | "set" | "toggle", ids: string[], isReset?: boolean }) => {
        fileTree.selectAction(action);
        setSelected(fileTree.getSelected());
        if (action.isReset !== true) {
            hk.handlers.selectAll = () => { selectAll.current?.(); };
        }
    }, [fileTree, hk]);

    return { selected, selectedReducer };
}

function SearchBox({ setSearchTerms }: {
    setSearchTerms: (terms: string[]) => void,
}) {
    const theme = useMantineTheme();

    const debouncedSetSearchTerms = useMemo(
        () => debounce(setSearchTerms, 500, { trailing: true, leading: false }),
        [setSearchTerms]);

    const searchRef = useRef<HTMLInputElement>(null);

    const onSearchClear = useCallback(() => {
        if (searchRef.current != null) searchRef.current.value = "";
        setSearchTerms([]);
    }, [setSearchTerms]);

    const onSearchInput = useCallback((e: React.FormEvent<HTMLInputElement>) => {
        debouncedSetSearchTerms(
            e.currentTarget.value
                .split(" ")
                .map((s) => s.trim().toLowerCase())
                .filter((s) => s !== ""));
    }, [debouncedSetSearchTerms]);

    return (
        <Box>
            <TextInput ref={searchRef}
                icon={<Icon.Search size="1rem" />}
                rightSection={<ActionIcon onClick={onSearchClear} title="Clear">
                    <Icon.XLg size="1rem" color={theme.colors.red[6]} />
                </ActionIcon>}
                placeholder="搜索文件"
                onInput={onSearchInput}
                styles={{
                    root: {
                        height: "1.5rem",
                    },
                    input: {
                        minHeight: "1.5rem",
                        height: "1.5rem",
                        lineHeight: "1rem",
                    },
                }}
            />
        </Box>
    );
}

export function FileTreeTable(props: FileTreeTableProps) {
    const config = useContext(ConfigContext);
    const serverConfig = useContext(ServerConfigContext);
    const onCheckboxChange = props.onCheckboxChange;

    const nameSortFunc = useCallback(
        (rowa: Row<FileDirEntryView>, rowb: Row<FileDirEntryView>) => {
            const [a, b] = [rowa.original, rowb.original];
            return a.fullpath < b.fullpath ? -1 : 1;
        }, []);

    const columns = useMemo(() => AllFields
        .filter((field) => field.briefField === true || props.brief !== true)
        .map((field): ColumnDef<FileDirEntryView> => {
            const cell = (cellProps: CellContext<FileDirEntryView, unknown>) => {
                return <field.component
                    fileTree={props.fileTree}
                    fieldName={field.name}
                    entry={cellProps.row.original}
                    row={cellProps.row}
                    treeName={props.brief === true ? "filetreebrief" : "filetree"}
                    onCheckboxChange={onCheckboxChange} />;
            };
            const column: ColumnDef<FileDirEntryView> = {
                header: field.label,
                accessorKey: field.name,
                cell,
            };
            if (field.name === "name") column.sortingFn = nameSortFunc;
            return column;
        }), [props.brief, props.fileTree, nameSortFunc, onCheckboxChange]);

    const getRowId = useCallback((row: FileDirEntryView) => row.fullpath, []);
    const getSubRows = useCallback((row: FileDirEntryView) => row.subrows, []);

    const onEntryOpen = useCallback((rowPath: string, reveal: boolean = false) => {
        if (TAURI) {
            if (props.downloadDir === undefined || props.downloadDir === "") return;
            let path = props.downloadDir;
            if (!path.endsWith("/") && !path.endsWith("\\")) {
                path = path + "/";
            }
            path = path + rowPath;
            path = pathMapFromServer(path, serverConfig);
            invoke("shell_open", { path, reveal }).catch((e) => {
                notifications.show({
                    title: "打开失败",
                    message: path,
                    color: "red",
                });
            });
        }
    }, [props.downloadDir, serverConfig]);

    const onRowDoubleClick = useCallback((row: FileDirEntryView) => {
        const rowPath = row.fullpath + (row.subrows.length > 0 ? "/" : "");
        onEntryOpen(rowPath);
    }, [onEntryOpen]);

    const [info, setInfo, handler] = useContextMenu();

    const tableRef = useRef<TrguiTableRef>();

    const [searchTerms, setSearchTerms] = useState<string[]>([]);

    const data = useMemo(() => {
        if (searchTerms.length === 0) return props.data;

        const filter = (entries: FileDirEntryView[]) => {
            const result: FileDirEntryView[] = [];
            entries.forEach((entry) => {
                if (entry.subrows.length > 0) {
                    const copy = { ...entry };
                    copy.subrows = filter(copy.subrows);
                    if (copy.subrows.length > 0 || entryMatchesSearchTerms(copy, searchTerms)) {
                        result.push(copy);
                    }
                } else if (entryMatchesSearchTerms(entry, searchTerms)) {
                    result.push(entry);
                }
            });
            return result;
        };

        return filter(props.data);
    }, [searchTerms, props.data]);

    useEffect(() => {
        if (searchTerms.length > 0) tableRef.current?.setExpanded(true);
        else tableRef.current?.setExpanded(false);
    }, [searchTerms]);

    const [current, setCurrent] = useState("");
    const { selected, selectedReducer } = useSelected(data, props.fileTree, searchTerms);

    useEffect(() => {
        selectedReducer({ verb: "set", ids: [], isReset: true });
        setCurrent("");
    }, [props.fileTree.torrenthash, selectedReducer]);

    const [showFileSearchBox, toggleFileSearchBox] = useReducer((shown: boolean) => {
        const show = !shown;
        if (!show) setSearchTerms([]);
        config.values.interface.showFilesSearchBox = show;
        return show;
    }, config.values.interface.showFilesSearchBox);

    return (
        <Flex w="100%" h="100%" onContextMenu={handler} direction="column">
            {props.brief === true
                ? <></>
                : <FiletreeContextMenu
                    contextMenuInfo={info}
                    setContextMenuInfo={setInfo}
                    fileTree={props.fileTree}
                    selected={selected}
                    currentRow={current}
                    onEntryOpen={onEntryOpen}
                    setExpanded={tableRef.current?.setExpanded}
                    toggleFileSearchBox={toggleFileSearchBox} />}
            {showFileSearchBox && <SearchBox setSearchTerms={setSearchTerms} />}
            <div style={{ flexGrow: 1 }}>
                <TrguiTable<FileDirEntryView> {...{
                    tablename: props.brief === true ? "filetreebrief" : "filetree",
                    tableRef,
                    columns,
                    data,
                    selected,
                    getRowId,
                    getSubRows,
                    selectedReducer,
                    setCurrent,
                    onRowDoubleClick,
                }} />
            </div>
        </Flex>
    );
}

function FiletreeContextMenu(props: {
    contextMenuInfo: ContextMenuInfo,
    setContextMenuInfo: (i: ContextMenuInfo) => void,
    fileTree: CachedFileTree,
    selected: string[],
    currentRow: string,
    onEntryOpen: (rowPath: string, reveal: boolean) => void,
    setExpanded?: (state: boolean) => void,
    toggleFileSearchBox: () => void,
}) {
    const config = useContext(ConfigContext);

    const { onEntryOpen } = props;
    const onOpen = useCallback((reveal: boolean) => {
        const entry = props.fileTree.findEntry(props.currentRow);
        if (entry === undefined) return;
        const rowPath = entry.fullpath + (isDirEntry(entry) ? "/" : "");
        onEntryOpen(rowPath, reveal);
    }, [onEntryOpen, props.fileTree, props.currentRow]);

    const { mutate } = useMutateTorrent();

    const setPriority = useCallback((priority: "priority-high" | "priority-normal" | "priority-low") => {
        const fileIds = Array.from(props.selected
            .map((path) => props.fileTree.getChildFilesIndexes(path))
            .reduce((set, curIds) => {
                curIds.forEach((id) => set.add(id));
                return set;
            }, new Set<number>()));

        mutate(
            {
                torrentIds: [props.fileTree.torrentId],
                fields: {
                    [priority]: fileIds,
                },
            },
            {
                onSuccess: () => {
                    notifications.show({
                        message: "Priority updated",
                        color: "green",
                    });
                },
            },
        );
    }, [mutate, props.fileTree, props.selected]);

    const setWanted = useCallback((wanted: boolean) => {
        const fileIds = Array.from(props.selected
            .map((path) => props.fileTree.getChildFilesIndexes(path))
            .reduce((set, curIds) => {
                curIds.forEach((id) => set.add(id));
                return set;
            }, new Set<number>()));

        mutate(
            {
                torrentIds: [props.fileTree.torrentId],
                fields: {
                    [wanted ? "files-wanted" : "files-unwanted"]: fileIds,
                },
            },
            {
                onSuccess: () => {
                    notifications.show({
                        message: "Files updated",
                        color: "green",
                    });
                },
            },
        );
    }, [mutate, props.fileTree, props.selected]);

    const [flatFileTree, toggleFlatFileTree] = useReducer((value: boolean) => {
        value = !value;
        config.values.interface.flatFileTree = value;
        refreshFileTree("filetree");
        return value;
    }, config.values.interface.flatFileTree);

    return (
        <ContextMenu contextMenuInfo={props.contextMenuInfo} setContextMenuInfo={props.setContextMenuInfo}>
            {TAURI && <>
                <Menu.Item
                    onClick={() => { onOpen(false); }}
                    icon={<Icon.BoxArrowUpRight size="1.1rem" />}
                    disabled={props.currentRow === ""}>
                    <Text weight="bold">打开文件</Text>
                </Menu.Item>
                <Menu.Item
                    onClick={() => { onOpen(true); }}
                    icon={<Icon.Folder2Open size="1.1rem" />}
                    disabled={props.currentRow === ""}>
                    <Text>打开目录</Text>
                </Menu.Item>
                <Menu.Divider />
            </>}
            <Menu.Item
                onClick={() => { setPriority("priority-high"); }}
                icon={<Icon.CircleFill color="tomato" size="1.1rem" />}
                disabled={props.selected.length === 0}>
                优先级-高
            </Menu.Item>
            <Menu.Item
                onClick={() => { setPriority("priority-normal"); }}
                icon={<Icon.CircleFill color="seagreen" size="1.1rem" />}
                disabled={props.selected.length === 0}>
                优先级-正常
            </Menu.Item>
            <Menu.Item
                onClick={() => { setPriority("priority-low"); }}
                icon={<Icon.CircleFill color="gold" size="1.1rem" />}
                disabled={props.selected.length === 0}>
                优先级-低
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
                onClick={() => { setWanted(true); }}
                icon={<Checkbox checked readOnly />}
                disabled={props.selected.length === 0}>
                包含
            </Menu.Item>
            <Menu.Item
                onClick={() => { setWanted(false); }}
                icon={<Checkbox readOnly />}
                disabled={props.selected.length === 0}>
                不包含
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
                onClick={() => { props.setExpanded?.(true); }}
                icon={<Icon.PlusSquare size="1.1rem" />}>
                展开所有
            </Menu.Item>
            <Menu.Item
                onClick={() => { props.setExpanded?.(false); }}
                icon={<Icon.DashSquare size="1.1rem" />}>
                折叠所有
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
                onClick={props.toggleFileSearchBox}
                icon={<Icon.Search size="1.1rem" />}>
                打开/关闭搜索
            </Menu.Item>
            <Menu.Item
                onClick={toggleFlatFileTree}
                icon={<Checkbox checked={!flatFileTree} readOnly />}>
                树形列表
            </Menu.Item>
        </ContextMenu >
    );
}
