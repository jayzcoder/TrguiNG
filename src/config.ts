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

import React from "react";
import type {
    SortingState, ColumnSizingState, VisibilityState, ColumnOrderState,
} from "@tanstack/react-table";
import type { ColorScheme, DefaultMantineColor } from "@mantine/core";
import { deobfuscate, obfuscate } from "trutil";
const { readConfigText, writeConfigText } = await import(/* webpackChunkName: "taurishim" */"taurishim");

export interface ServerConnection {
    url: string,
    username: string,
    password: string,
}

export interface PathMapping {
    from: string,
    to: string,
}

export interface ServerConfig {
    name: string,
    connection: ServerConnection,
    pathMappings: PathMapping[],
    expandedDirFilters: string[],
    lastSaveDirs: string[],
    intervals: {
        session: number,
        torrents: number,
        torrentsMinimized: number,
        details: number,
    },
}

export interface SortByConfig {
    id: string,
    desc: boolean,
}

interface TableSettings {
    columns: string[],
    columnVisibility: Record<string, boolean>,
    columnOrder: string[],
    columnSizes: Record<string, number>,
    sortBy: SortByConfig[],
}

// TableName 无需汉化
const TableNames = ["torrents", "filetree", "filetreebrief", "trackers", "peers"] as const;
export type TableName = typeof TableNames[number];

const Sashes = ["vertical", "horizontal"] as const;
type SashName = typeof Sashes[number];
export type SplitType = SashName;

const FilterSections = ["种子状态", "数据目录", "用户标签", "服务器分布", "错误分布"] as const;
export type FilterSectionName = typeof FilterSections[number];

const StatusFilters = [
    "全部", "下载中", "已暂停", "已完成", "正在校验", "活动中", "未活动", "工作中", "错误", "磁力链接",
] as const;
export type StatusFilterName = typeof StatusFilters[number];
type StatusFiltersVisibility = Record<StatusFilterName, boolean>;

const StatusbarSections = [
    "连接状态", "下载速度", "上传速度", "剩余空间", "列表总大小", "选中大小",
] as const;
type StatusbarSectionName = typeof StatusbarSections[number];

const DetailsSections = [
    "常规", "文件", "块", "用户", "Tracker", "分割", "数据统计",
] as const;
type DetailsSectionsName = typeof DetailsSections[number];

export type SectionsVisibility<S extends string> = Array<{
    section: S,
    visible: boolean,
}>;

export const WindowMinimizeOptions = ["minimize", "hide"] as const;
export const WindowCloseOptions = ["hide", "close", "quit"] as const;
export const DeleteTorrentDataOptions = ["默认关", "默认开", "记住选择"] as const;
export const ProgressbarStyleOptions = ["plain", "animated", "colorful"] as const;
export type WindowMinimizeOption = typeof WindowMinimizeOptions[number];
export type WindowCloseOption = typeof WindowCloseOptions[number];
export type DeleteTorrentDataOption = typeof DeleteTorrentDataOptions[number];
export type ProgressbarStyleOption = typeof ProgressbarStyleOptions[number];

export interface ColorSetting {
    color: DefaultMantineColor,
    shade: number,
    computed: string,
}

export interface StyleOverrideColors {
    color?: ColorSetting,
    backgroundColor?: ColorSetting,
}

export interface StyleOverrides {
    dark: StyleOverrideColors,
    light: StyleOverrideColors,
    font?: string,
    color?: ColorSetting, // deprecated
    backgroundColor?: ColorSetting, // deprecated
}

interface Settings {
    servers: ServerConfig[],
    openTabs: string[],
    app: {
        window: {
            size: [number, number],
            position: [number, number] | undefined,
        },
        deleteAdded: boolean,
        toastNotifications: boolean,
        toastNotificationSound: boolean,
        showTrayIcon: boolean,
        onMinimize: WindowMinimizeOption,
        onClose: WindowCloseOption,
        fontSizeBase: number,
        fontSize: number,
    },
    interface: {
        theme: ColorScheme | undefined,
        tables: Record<TableName, TableSettings>,
        sashSizes: Record<SashName, [number, number]>,
        filterSections: SectionsVisibility<FilterSectionName>,
        statusFiltersVisibility: StatusFiltersVisibility,
        compactDirectories: boolean,
        showFilterGroupSize: boolean,
        selectFilterGroupOnDbClk: boolean,
        statusBarSections: SectionsVisibility<StatusbarSectionName>,
        statusBarGlobalSpeeds: boolean,
        showFiltersPanel: boolean,
        showDetailsPanel: boolean,
        detailsTabs: SectionsVisibility<DetailsSectionsName>,
        showFilesSearchBox: boolean,
        flatFileTree: boolean,
        mainSplit: SplitType,
        skipAddDialog: boolean,
        deleteTorrentData: DeleteTorrentDataOption,
        deleteTorrentDataSelection: boolean,
        deleteTorrentDataWhenOneSelection: boolean,
        numLastSaveDirs: number,
        preconfiguredLabels: string[],
        defaultTrackers: string[],
        styleOverrides: StyleOverrides,
        progressbarStyle: ProgressbarStyleOption,
    },
}

const DefaultColumnVisibility: Partial<Record<TableName, VisibilityState>> = {
    torrents: {
        sizeWhenDone: false,
        leftUntilDone: false,
        downloadedEver: false,
        uploadedEver: false,
        simpleRatio: false,
        eta: false,
        tracker: false,
        trackerStatus: false,
        doneDate: false,
        activityDate: false,
        downloadDir: false,
        id: false,
        queuePosition: false,
        isPrivate: false,
        group: false,
        "file-count": false,
        pieceCount: false,
        metadataPercentComplete: false,
    },
    peers: {
        flagStr: false,
        cachedFrom: false,
        cachedConnection: false,
        cachedProtocol: false,
    },
} as const;

// Based on a list from https://github.com/ngosang/trackerslist
const DefaultTrackerList = [
] as const;

const DefaultSettings: Settings = {
    servers: [],
    openTabs: [],
    app: {
        window: {
            size: [1024, 800],
            position: undefined,
        },
        deleteAdded: false,
        toastNotifications: true,
        toastNotificationSound: true,
        showTrayIcon: true,
        onMinimize: "minimize",
        onClose: "quit",
        fontSizeBase: 0.9,
        fontSize: 0.9,
    },
    interface: {
        theme: undefined,
        tables: Object.fromEntries(TableNames.map((table) => [table, {
            columns: [],
            columnVisibility: DefaultColumnVisibility[table] ?? {},
            columnOrder: [],
            columnSizes: {},
            sortBy: [],
        }])) as unknown as Record<TableName, TableSettings>,
        sashSizes: {
            vertical: [70, 30],
            horizontal: [20, 80],
        },
        filterSections: FilterSections.map((section) => ({
            section,
            visible: true,
        })),
        statusFiltersVisibility: Object.fromEntries(
            StatusFilters.map((filterName) => [
                filterName,
                !["工作中", "磁力链接"].includes(filterName),
            ]),
        ) as Record<StatusFilterName, boolean>,
        compactDirectories: false,
        showFilterGroupSize: true,
        selectFilterGroupOnDbClk: true,
        statusBarSections: StatusbarSections.map((section) => ({
            section,
            visible: true,
        })),
        statusBarGlobalSpeeds: true,
        showFiltersPanel: true,
        showDetailsPanel: true,
        detailsTabs: DetailsSections.map((section) => ({
            section,
            visible: true,
        })),
        showFilesSearchBox: false,
        flatFileTree: false,
        mainSplit: "vertical",
        skipAddDialog: false,
        deleteTorrentData: "默认关",
        deleteTorrentDataSelection: false,
        deleteTorrentDataWhenOneSelection: false,
        numLastSaveDirs: 20,
        preconfiguredLabels: [],
        defaultTrackers: [...DefaultTrackerList],
        styleOverrides: {
            dark: {},
            light: {},
        },
        progressbarStyle: "animated",
    },
};

export class Config {
    values = DefaultSettings;

    async read() {
        const merge = (await import(/* webpackChunkName: "lodash" */ "lodash-es/merge")).default;
        try {
            const text = await readConfigText();
            merge(this.values, JSON.parse(text));
            const overrides = this.values.interface.styleOverrides;
            if (overrides.color !== undefined) {
                overrides[this.values.interface.theme ?? "light"].color = overrides.color;
                overrides.color = undefined;
            }
            if (overrides.backgroundColor !== undefined) {
                overrides[this.values.interface.theme ?? "light"].backgroundColor = overrides.backgroundColor;
                overrides.backgroundColor = undefined;
            }
        } catch (e) {
            console.log(e);
        }

        // sanitize data
        this.values.openTabs = this.values.openTabs.filter(
            (name) => this.values.servers.find((s) => s.name === name) !== undefined,
        );

        this.values.servers = this.values.servers.map(
            (s) => ({ ...s, connection: { ...s.connection, password: deobfuscate(s.connection.password) } }));

        for (const section of FilterSections) {
            if (!this.values.interface.filterSections.find(s => s.section == section)) {
                this.values.interface.filterSections.push({
                    section,
                    visible: true,
                })
            }
        }
        this.values.interface.filterSections = this.values.interface.filterSections.filter(s => FilterSections.indexOf(s.section) >= 0);

        for (const section of DetailsSections) {
            if (!this.values.interface.detailsTabs.find(s => s.section == section)) {
                this.values.interface.detailsTabs.push({
                    section,
                    visible: true,
                })
            }
        }
        this.values.interface.detailsTabs = this.values.interface.detailsTabs.filter(s => DetailsSections.indexOf(s.section) >= 0);

        for (const section of StatusbarSections) {
            if (!this.values.interface.statusBarSections.find(s => s.section == section)) {
                this.values.interface.statusBarSections.push({
                    section,
                    visible: true,
                })
            }
        }
        this.values.interface.statusBarSections = this.values.interface.statusBarSections.filter(s => StatusbarSections.indexOf(s.section) >= 0);

        return this;
    }

    async save() {
        const values = { ...this.values };
        values.servers = values.servers.map(
            (s) => ({ ...s, connection: { ...s.connection, password: obfuscate(s.connection.password) } }));
        const configText = JSON.stringify(values, null, "    ");
        await writeConfigText(configText);
    }

    getTheme() {
        return this.values.interface.theme;
    }

    setTheme(value: ColorScheme) {
        this.values.interface.theme = value;
    }

    getSashSizes(sash: SashName) {
        return this.values.interface.sashSizes[sash];
    }

    setSashSizes(sash: SashName, sizes: [number, number]) {
        this.values.interface.sashSizes[sash] = sizes;
    }

    getServers(): ServerConfig[] {
        return this.values.servers;
    }

    getOpenServers(): ServerConfig[] {
        return this.values.servers.filter((s) => this.values.openTabs.includes(s.name));
    }

    setServers(servers: ServerConfig[]) {
        this.values.servers = servers;
    }

    getServer(name: string): ServerConfig | undefined {
        return this.values.servers.find((s) => s.name === name);
    }

    getOpenTabs() {
        return this.values.openTabs;
    }

    setOpenTabs(tabs: string[]) {
        this.values.openTabs = tabs;
    }

    setTableColumnSizes(table: TableName, sizes: ColumnSizingState) {
        this.values.interface.tables[table].columnSizes = sizes;
    }

    getTableColumnSizes(table: TableName): ColumnSizingState {
        return this.values.interface.tables[table].columnSizes;
    }

    setTableColumnVisibility(table: TableName, visibility: VisibilityState) {
        this.values.interface.tables[table].columnVisibility = visibility;
    }

    getTableColumnVisibility(table: TableName): VisibilityState {
        return this.values.interface.tables[table].columnVisibility;
    }

    setTableColumnOrder(table: TableName, order: ColumnOrderState) {
        this.values.interface.tables[table].columnOrder = order;
    }

    getTableColumnOrder(table: TableName): ColumnOrderState {
        return this.values.interface.tables[table].columnOrder;
    }

    setTableSortBy(table: TableName, sortBy: SortingState) {
        this.values.interface.tables[table].sortBy = sortBy;
    }

    getTableSortBy(table: TableName): SortingState {
        return this.values.interface.tables[table].sortBy;
    }

    addSaveDir(serverName: string, dir: string) {
        const saveDirs = this.removeSaveDir(serverName, dir);
        if (saveDirs === undefined) return;
        saveDirs.unshift(dir);
        while (saveDirs.length > this.values.interface.numLastSaveDirs) {
            saveDirs.pop();
        }
    }

    removeSaveDir(serverName: string, dir: string): string[] | undefined {
        const saveDirs = this.getServer(serverName)?.lastSaveDirs;
        if (saveDirs === undefined) return;
        const index = saveDirs.findIndex((d) => d === dir);
        if (index >= 0) saveDirs.splice(index, 1);
        return saveDirs;
    }
}

export const ConfigContext = React.createContext(new Config());
export const ServerConfigContext = React.createContext<ServerConfig>({
    connection: { url: "", username: "", password: "" },
    name: "",
    pathMappings: [],
    expandedDirFilters: [],
    lastSaveDirs: [],
    intervals: { session: 0, torrents: 0, torrentsMinimized: 0, details: 0 },
});
