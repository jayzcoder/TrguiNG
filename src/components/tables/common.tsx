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

import { ActionIcon, Box, Group, Menu, TextInput } from "@mantine/core";
import * as Icon from "react-bootstrap-icons";
import type {
    Table, ColumnDef, ColumnSizingState,
    SortingState, VisibilityState, Row, Column, RowSelectionState,
    ColumnOrderState, AccessorKeyColumnDef, Header, HeaderGroup,
} from "@tanstack/react-table";
import {
    useReactTable, getCoreRowModel, getSortedRowModel, getExpandedRowModel, flexRender,
} from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ContextMenu, useContextMenu } from "components/contextmenu";
import type { TableName } from "config";
import { ConfigContext } from "config";
import React, { memo, useReducer, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { DropResult } from "react-beautiful-dnd";
import { DragDropContext, Draggable } from "react-beautiful-dnd";
import { StrictModeDroppable } from "components/strictmodedroppable";
import { eventHasModKey, reorderElements } from "trutil";
import { useFontSize } from "themehooks";

const defaultColumn = {
    minSize: 30,
    size: 150,
    maxSize: 2000,
};

function useTable<TData>(
    tablename: TableName,
    columns: Array<ColumnDef<TData, unknown> | AccessorKeyColumnDef<TData>>,
    data: TData[],
    selected: string[],
    getRowId: (r: TData) => string,
    getSubRows?: (r: TData) => TData[],
    onVisibilityChange?: React.Dispatch<VisibilityState>,
): [
        Table<TData>,
        VisibilityState,
        (v: VisibilityState) => void,
        ColumnOrderState,
        (o: ColumnOrderState) => void,
        ColumnSizingState,
        SortingState,
        Set<string>,
    ] {
    const config = useContext(ConfigContext);

    const [columnVisibility, setColumnVisibility] =
        useState<VisibilityState>(config.getTableColumnVisibility(tablename));
    const [columnOrder, setColumnOrder] =
        useState<ColumnOrderState>(config.getTableColumnOrder(tablename));
    const [columnSizing, setColumnSizing] =
        useState<ColumnSizingState>(config.getTableColumnSizes(tablename));
    const [sorting, setSorting] =
        useState<SortingState>(config.getTableSortBy(tablename));
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [rowsWithSelectedDescendants, setRowsWithSelectedDescendants] =
        useState<Set<string>>(new Set());

    useEffect(() => {
        config.setTableColumnVisibility(tablename, columnVisibility);
        onVisibilityChange?.(columnVisibility);
    }, [config, columnVisibility, onVisibilityChange, tablename]);
    useEffect(() => {
        config.setTableColumnOrder(tablename, columnOrder);
    }, [config, columnOrder, tablename]);
    useEffect(() => {
        config.setTableColumnSizes(tablename, columnSizing);
    }, [config, columnSizing, tablename]);
    useEffect(() => {
        config.setTableSortBy(tablename, sorting);
    }, [config, sorting, tablename]);
    useEffect(() => {
        setRowSelection(Object.fromEntries(selected.map((id) => [id, true])));
    }, [selected]);

    const table = useReactTable<TData>({
        columns,
        data,
        defaultColumn,
        getRowId,
        enableExpanding: getSubRows !== undefined,
        getSubRows,
        enableHiding: true,
        onColumnVisibilityChange: setColumnVisibility,
        onColumnOrderChange: setColumnOrder,
        enableColumnResizing: true,
        columnResizeMode: "onChange",
        onColumnSizingChange: setColumnSizing,
        enableSorting: true,
        onSortingChange: setSorting,
        enableRowSelection: true,
        state: {
            columnVisibility,
            columnOrder,
            columnSizing,
            sorting,
            rowSelection,
        },
        getCoreRowModel: getCoreRowModel(),
        getExpandedRowModel: getExpandedRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    useEffect(() => {
        if (columnOrder.length === 0) setColumnOrder(table.getAllLeafColumns().map((c) => c.id));
    }, [columnOrder, table]);

    useEffect(() => {
        if (!table.getCanSomeRowsExpand()) return;

        const newRowsWithSelectedDescendants = new Set<string>();

        const recurse = (row: Row<TData>): boolean => {
            if (rowSelection[row.id]) return true;

            let hasSelectedDescendant = false;
            row.subRows.forEach(subrow => {
                if (recurse(subrow)) {
                    hasSelectedDescendant = true;
                }
            });

            if (hasSelectedDescendant) {
                newRowsWithSelectedDescendants.add(row.id);
                return true;
            }

            return false;
        };
        table.getCoreRowModel().rows.forEach(recurse);

        setRowsWithSelectedDescendants(newRowsWithSelectedDescendants);
    }, [table, rowSelection]);

    return [table, columnVisibility, setColumnVisibility, columnOrder, setColumnOrder, columnSizing, sorting, rowsWithSelectedDescendants];
}

interface HIDEvent {
    modKey: boolean,
    shiftKey: boolean,
    isRmb: boolean,
}

function useSelectHandler<TData>(
    table: Table<TData>,
    selectedReducer: TableSelectReducer,
    getRowId: (row: TData) => string,
    setCurrent?: (id: string) => void,
): [number, (event: HIDEvent, index: number, lastIndex: number) => void] {
    const [lastIndex, setLastIndex] = useState(-1);

    const onRowClick = useCallback((event: HIDEvent, index: number, lastIndex: number) => {
        const rows = table.getRowModel().rows;
        if (index < 0 || index >= rows.length) return;

        function genIds() {
            const minIndex = Math.min(index, lastIndex);
            const maxIndex = Math.max(index, lastIndex);
            const ids = [];
            for (let i = minIndex; i <= maxIndex; i++) {
                ids.push(getRowId(rows[i].original));
            }
            return ids;
        }

        if (event.shiftKey && event.modKey && lastIndex !== -1) {
            const ids = genIds();
            selectedReducer({ verb: "add", ids });
        } else if (event.shiftKey && lastIndex !== -1) {
            const ids = genIds();
            selectedReducer({ verb: "set", ids });
        } else if (event.modKey) {
            selectedReducer({ verb: "toggle", ids: [getRowId(rows[index].original)] });
        } else if (!event.isRmb || !rows[index].getIsSelected()) {
            selectedReducer({ verb: "set", ids: [getRowId(rows[index].original)] });
        }

        if (event.shiftKey) {
            document.getSelection()?.removeAllRanges();
        } else {
            setLastIndex(index);
        }
        if (setCurrent !== undefined) {
            setCurrent(getRowId(rows[index].original));
        }
    }, [getRowId, selectedReducer, setCurrent, table]);

    return [lastIndex, onRowClick];
}

function useTableVirtualizer(count: number): [React.MutableRefObject<HTMLElement | null>, number, Virtualizer<HTMLElement, Element>] {
    const parentRef = useRef<HTMLElement | null>(null);

    const { value: fontSize } = useFontSize();

    const rowHeight = Math.ceil(16 * fontSize * 1.6);

    const rowVirtualizer = useVirtualizer({
        count,
        getScrollElement: () => parentRef.current,
        overscan: 3,
        estimateSize: useCallback(() => rowHeight, [rowHeight]),
    });

    const { measure } = rowVirtualizer;

    useEffect(() => { measure(); }, [rowHeight, measure]);

    return [parentRef, rowHeight, rowVirtualizer];
}

function useSynchronizedScroll(fromRef: React.MutableRefObject<HTMLElement | null>, toRef: React.MutableRefObject<HTMLElement | null>): [
    (node: HTMLElement | null) => void,
    (node: HTMLElement | null) => void,
    () => void,
] {
    const syncScroll = useCallback(() => {
        if (fromRef.current == null || toRef.current == null) return;
        toRef.current.style.translate = `${-fromRef.current.scrollLeft}px`;
    }, [fromRef, toRef]);

    const toRefProxy = useCallback((node: HTMLElement | null) => {
        toRef.current = node;
        syncScroll();
    }, [syncScroll, toRef]);

    const fromRefProxy = useCallback((node: HTMLElement | null) => {
        fromRef.current = node;
        syncScroll();
    }, [syncScroll, fromRef]);

    return [fromRefProxy, toRefProxy, syncScroll];
}

export type TableSelectReducer = React.Dispatch<{ verb: "add" | "set" | "toggle", ids: string[] }>;

export function useStandardSelect(): [string[], TableSelectReducer] {
    const [selected, selectedReducer] = useReducer(
        (old: string[], action: { verb: "add" | "set" | "toggle", ids: string[] }) => {
            if (action.verb === "set") return action.ids;
            if (action.verb === "toggle") {
                const newset = new Set(old);
                action.ids.forEach((id) => {
                    if (newset.has(id)) newset.delete(id);
                    else newset.add(id);
                });
                return Array.from(newset);
            } else {
                const newset = new Set(old);
                action.ids.forEach((id) => newset.add(id));
                return Array.from(newset);
            }
        }, []);

    return [selected, selectedReducer];
}

function InnerRow<TData>(props: {
    row: Row<TData>,
    expanded: boolean | undefined,
    columnSizing: ColumnSizingState,
    columnVisibility: VisibilityState,
    columnOrder: ColumnOrderState,
}) {
    return <>
        {props.row.getVisibleCells().map(cell => {
            return (
                <div key={cell.id} className="td" style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div >
            );
        })}
    </>;
}

const MemoizedInnerRow = memo(InnerRow, (prev, next) => {
    return (
        prev.row.original === next.row.original &&
        prev.expanded === next.expanded &&
        prev.columnSizing === next.columnSizing &&
        prev.columnVisibility === next.columnVisibility &&
        prev.columnOrder === next.columnOrder
    );
}) as typeof InnerRow;

const RowSelectedContext = React.createContext<boolean>(false);

export function useRowSelected() {
    return useContext(RowSelectedContext);
}

function TableRow<TData>(props: {
    row: Row<TData>,
    selected: boolean,
    descendantSelected: boolean,
    expanded: boolean,
    index: number,
    start: number,
    lastIndex: number,
    onRowClick: (e: HIDEvent, i: number, li: number) => void,
    onRowDoubleClick?: (row: TData) => void,
    height: number,
    columnSizing: ColumnSizingState,
    columnVisibility: VisibilityState,
    columnOrder: ColumnOrderState,
}) {
    const { onRowDoubleClick: propsDblClick, row } = props;
    const onRowDoubleClick = useCallback(() => {
        if (propsDblClick !== undefined) {
            propsDblClick(row.original);
        }
    }, [propsDblClick, row.original]);

    const { onRowClick, index, lastIndex } = props;

    const onMouseEvent = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        onRowClick({
            modKey: eventHasModKey(e),
            shiftKey: e.shiftKey,
            isRmb: e.button === 2,
        }, index, lastIndex);
    }, [index, lastIndex, onRowClick]);

    const ref = useRef<HTMLDivElement>(null);

    const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        let newIndex = index;
        if (e.key === "ArrowDown") {
            newIndex += 1;
        } else if (e.key === "ArrowUp") {
            newIndex -= 1;
        } else if (e.key !== "ContextMenu") {
            return;
        }
        e.preventDefault();
        if (ref.current != null) {
            if (e.key === "ArrowDown" && ref.current.nextElementSibling != null) {
                const element = ref.current.nextElementSibling as HTMLElement;
                element.scrollIntoView({ behavior: "instant", block: "nearest" });
                element.focus();
            }
            if (e.key === "ArrowUp" && ref.current.previousElementSibling != null) {
                const element = ref.current.previousElementSibling as HTMLElement;
                element.scrollIntoView({ behavior: "instant", block: "nearest" });
                element.focus();
            }
        }
        onRowClick({
            modKey: eventHasModKey(e),
            shiftKey: e.shiftKey,
            isRmb: e.key === "ContextMenu",
        }, newIndex, lastIndex);
    }, [index, lastIndex, onRowClick]);

    return (
        <div ref={ref}
            className={`tr${props.selected ? " selected" : props.descendantSelected ? " descendant-selected" : ""}`}
            style={{ height: `${props.height}px`, transform: `translateY(${props.start}px)` }}
            onClick={onMouseEvent}
            onContextMenu={onMouseEvent}
            onDoubleClick={onRowDoubleClick}
            onKeyDown={onKeyDown}
            tabIndex={-1}
        >
            <RowSelectedContext.Provider value={props.selected}>
                <MemoizedInnerRow {...props} />
            </RowSelectedContext.Provider>
        </div>
    );
}

const MemoizedTableRow = memo(TableRow) as typeof TableRow;

function HeaderRow<TData>(
    { headerGroup, height, resizerOffset, columnVisibility, setColumnVisibility, columnOrder, setColumnOrder, columns }: {
        headerGroup: HeaderGroup<TData>,
        height: number,
        resizerOffset: number | null,
        columnVisibility: VisibilityState,
        setColumnVisibility: (v: VisibilityState) => void,
        columnOrder: ColumnOrderState,
        setColumnOrder: (s: ColumnOrderState) => void,
        columns: Array<Column<TData, unknown>>,
    },
) {
    const [info, setInfo, handler] = useContextMenu();

    const onColumnMenuItemClick = useCallback((value: string, checked: boolean) => {
        setColumnVisibility({ ...columnVisibility, [value]: checked });
    }, [columnVisibility, setColumnVisibility]);

    const columnIds = useMemo(() => columns.map((c) => c.id), [columns]);

    const onDragEnd = useCallback((result: DropResult) => {
        if (result.destination != null) {
            // sanitize columnOrder in case there are non-existing columns
            // (can happen with bad config)
            let newOrder = columnOrder.filter((f) => columnIds.includes(f));
            columnIds.forEach((f) => {
                if (!newOrder.includes(f)) newOrder.push(f);
            });
            // reorder
            newOrder = reorderElements(newOrder, result.source.index, result.destination.index);
            setColumnOrder(newOrder);
        }
    }, [columnIds, columnOrder, setColumnOrder]);

    return (
        <Box className="tr" onContextMenu={handler} h={`${height}px`}>
            <ContextMenu
                contextMenuInfo={info}
                setContextMenuInfo={setInfo}
                closeOnItemClick={false}
            >
                <DragDropContext onDragEnd={onDragEnd}>
                    <StrictModeDroppable droppableId="tableheadercontextmenu">
                        {provided => (
                            <div ref={provided.innerRef} {...provided.droppableProps}>
                                {columns.map((column, index) => {
                                    const visible = !(column.id in columnVisibility) || columnVisibility[column.id];
                                    return (
                                        <Draggable draggableId={column.id} index={index} key={column.id}>
                                            {(provided) => (
                                                <Group ref={provided.innerRef} {...provided.draggableProps} noWrap>
                                                    <Menu.Item
                                                        icon={column.id === "name"
                                                            ? <Icon.Lock size="1rem" />
                                                            : visible ? <Icon.Check size="1rem" /> : <Box miw="1rem" />}
                                                        onClick={() => {
                                                            if (column.id !== "name") {
                                                                onColumnMenuItemClick(column.id, !visible);
                                                            }
                                                        }}
                                                    >
                                                        {column.columnDef.header as string}
                                                    </Menu.Item>
                                                    <div {...provided.dragHandleProps}>
                                                        <Icon.GripVertical size="12" />
                                                    </div>
                                                </Group>
                                            )}
                                        </Draggable>
                                    );
                                })}
                                {provided.placeholder}
                            </div>
                        )}
                    </StrictModeDroppable>
                </DragDropContext>
            </ContextMenu >
            {headerGroup.headers.map(header => (
                <HeaderCell key={header.id} header={header} resizerOffset={resizerOffset} />))}
        </Box>
    );
}

const MemoizedHeaderRow = memo(HeaderRow) as typeof HeaderRow;

function HeaderCell<TData>({ header, resizerOffset }: { header: Header<TData, unknown>, resizerOffset: number | null }) {
    return (
        <div className="th" style={{
            width: header.getSize(),
        }}>
            <div onClick={header.column.getToggleSortingHandler()} style={{ flexGrow: 1 }}>
                <span>
                    {header.column.getIsSorted() !== false
                        ? header.column.getIsSorted() === "desc"
                            ? "▼ "
                            : "▲ "
                        : ""}
                </span>
                {flexRender(
                    header.column.columnDef.header,
                    header.getContext())}
            </div>
            <div {...{
                onMouseDown: header.getResizeHandler(),
                onTouchStart: header.getResizeHandler(),
                className: `resizer ${header.column.getIsResizing() ? "isResizing" : ""}`,
            }} >
                {resizerOffset != null && <div className="resizer-guide" />}
            </div>
        </div>
    );
}

export interface TrguiTableRef {
    setExpanded: (state: boolean) => void,
}

export function TrguiTable<TData>(props: {
    tablename: TableName,
    tableRef?: React.MutableRefObject<TrguiTableRef | undefined>,
    columns: Array<ColumnDef<TData, unknown>>,
    data: TData[],
    selected: string[],
    getRowId: (r: TData) => string,
    getSubRows?: (r: TData) => TData[],
    selectedReducer: TableSelectReducer,
    setCurrent?: (id: string) => void,
    onRowDoubleClick?: (row: TData) => void,
    onVisibilityChange?: React.Dispatch<VisibilityState>,
    scrollToRow?: { id: string },
}) {
    const [table, columnVisibility, setColumnVisibility, columnOrder, setColumnOrder, columnSizing, sorting, rowsWithSelectedDescendants] =
        useTable(props.tablename, props.columns, props.data, props.selected, props.getRowId, props.getSubRows, props.onVisibilityChange);

    if (props.tableRef !== undefined) {
        props.tableRef.current = {
            setExpanded: table.toggleAllRowsExpanded,
        };
    }

    const [lastIndex, onRowClick] = useSelectHandler(
        table, props.selectedReducer, props.getRowId, props.setCurrent);

    const [parentRef, rowHeight, virtualizer] = useTableVirtualizer(table.getRowModel().rows.length);

    const scrollToId = useMemo(() => {
        return table.getRowModel().rows.findIndex(
            (row) => props.getRowId(row.original) === props.scrollToRow?.id);
    }, [props, table]);

    useEffect(() => {
        if (scrollToId >= 0) {
            virtualizer.scrollToIndex(scrollToId, { align: "auto" });
        }
    }, [scrollToId, virtualizer]);

    const width = table.getTotalSize();

    const headerRef = useRef<HTMLElement | null>(null);
    const [parentRefProxy, headerRefProxy, syncHeaderScroll] = useSynchronizedScroll(parentRef, headerRef);

    return (
        <div className="torrent-table-container">
            <Box
                ref={headerRefProxy}
                sx={(theme) => ({
                    height: `${rowHeight}px`,
                    width: `${width}px`,
                    backgroundColor: theme.colorScheme === "dark" ? theme.colors.dark[5] : theme.colors.gray[2],
                    flexShrink: 0,
                    position: "relative",
                })}>
                {table.getHeaderGroups().map(headerGroup => (
                    <MemoizedHeaderRow key={headerGroup.id} {...{
                        headerGroup,
                        height: rowHeight,
                        resizerOffset: table.getState().columnSizingInfo.deltaOffset,
                        columnVisibility,
                        setColumnVisibility,
                        columnOrder,
                        setColumnOrder,
                        sorting,
                        columns: table.getAllLeafColumns(),
                    }} />
                ))}
            </Box>
            <div ref={parentRefProxy} className="torrent-table-rows" onScroll={syncHeaderScroll} tabIndex={-1}>
                <div className="torrent-table"
                    style={{ height: `${virtualizer.getTotalSize()}px`, width: `${width}px` }}>
                    {virtualizer.getVirtualItems()
                        // drop first row if it is odd one to keep nth-child(odd) selector
                        // stable this prevents flickering row background on scroll
                        .filter((virtualRow, virtualIndex) => (virtualIndex !== 0 || virtualRow.index % 2 === 0))
                        .map((virtualRow) => {
                            const row = table.getRowModel().rows[virtualRow.index];
                            return <MemoizedTableRow<TData> key={props.getRowId(row.original)} {...{
                                row,
                                selected: row.getIsSelected(),
                                descendantSelected: rowsWithSelectedDescendants.has(row.id),
                                expanded: row.getIsExpanded(),
                                index: virtualRow.index,
                                lastIndex,
                                start: virtualRow.start,
                                onRowClick,
                                onRowDoubleClick: props.onRowDoubleClick,
                                height: rowHeight,
                                columnSizing,
                                columnVisibility,
                                columnOrder,
                            }} />;
                        })}
                </div>
            </div>
        </div>
    );
}

interface EditableNameFieldProps extends React.PropsWithChildren {
    currentName: string,
    onUpdate?: (newName: string, onStart: () => void, onEnd: () => void) => void,
    onArrowLeftRight?: (key: string) => void,
}

export function EditableNameField(props: EditableNameFieldProps) {
    const textRef = useRef<HTMLInputElement>(null);

    const [newName, setNewName] = useState("");
    const [isHover, setHover] = useState(false);
    const [isRenaming, setRenaming] = useState(false);

    const renameHandler = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setRenaming(true);
        setNewName(props.currentName.split("/").pop() ?? "");
    }, [props.currentName]);

    const ref = useRef<HTMLDivElement>(null);

    const onTextKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            props.onUpdate?.(
                newName,
                () => {
                    if (textRef.current != null) textRef.current.readOnly = true;
                },
                () => { setRenaming(false); });
        }
        if (event.key === "Escape") {
            setRenaming(false);
            ref.current?.focus();
        }
    }, [newName, props]);

    useEffect(() => {
        if (isRenaming && textRef.current != null) {
            textRef.current.focus();
            textRef.current.select();
        }
    }, [isRenaming]);

    useEffect(() => {
        if (ref.current != null) {
            const row = ref.current.parentNode?.parentNode as HTMLDivElement;
            row.onfocus = () => {
                ref.current?.focus({ preventScroll: true });
            };
            return () => { row.onfocus = null; };
        }
    }, []);

    const { onArrowLeftRight } = props;

    const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "F2" && !isRenaming) {
            renameHandler();
        } else if (onArrowLeftRight !== undefined && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
            onArrowLeftRight(event.key);
        }
    }, [isRenaming, onArrowLeftRight, renameHandler]);

    return (
        <Box ref={ref} onKeyDown={onKeyDown} tabIndex={-1}
            onMouseEnter={() => { setHover(true); }} onMouseLeave={() => { setHover(false); }}
            sx={{ display: "flex", alignItems: "center", width: "100%", height: "100%" }}>
            {props.children}
            {isRenaming
                ? <TextInput ref={textRef} value={newName} sx={{ flexGrow: 1, height: "100%" }}
                    styles={{
                        input: {
                            height: "1.5rem",
                            minHeight: "1.5rem",
                            lineHeight: "1.3rem",
                        },
                    }}
                    onChange={(e) => { setNewName(e.target.value); }}
                    onBlur={() => { setRenaming(false); }}
                    onKeyDown={onTextKeyDown}
                    onClick={(e) => { e.stopPropagation(); }}
                    onDoubleClick={(e) => { e.stopPropagation(); }} />
                : <Box pl="xs" sx={{ flexGrow: 1, textOverflow: "ellipsis", overflow: "hidden" }}>
                    {props.currentName}
                </Box>}
            {isHover && !isRenaming && props.onUpdate !== undefined
                ? <ActionIcon onClick={renameHandler} title="重命名 (F2)"
                    sx={(theme) => ({
                        flexShrink: 0,
                        ".selected &": { color: theme.colors.gray[2] },
                        "@media (hover: hover)": {
                            "&:hover": {
                                color: theme.colorScheme === "dark"
                                    ? theme.white
                                    : theme.colors.dark[8],
                                backgroundColor: "rgba(127, 127, 127, 0.15)",
                            },
                            ".selected &:hover": { color: theme.white },
                        },
                    })} >
                    <Icon.InputCursorText size="1rem" />
                </ActionIcon>
                : <></>}
        </Box>
    );
}
