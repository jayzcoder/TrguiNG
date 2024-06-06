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

import React, { useCallback, useEffect, useState } from "react";
import type { ColorScheme } from "@mantine/core";
import {Checkbox, Flex, Grid, MultiSelect, NativeSelect, NumberInput, Textarea, useMantineTheme} from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import ColorChooser from "components/colorchooser";
import { useGlobalStyleOverrides } from "themehooks";
import { DeleteTorrentDataOptions, ProgressbarStyleOptions } from "config";
import type { ProgressbarStyleOption, ColorSetting, DeleteTorrentDataOption, StyleOverrides } from "config";
import {ColorSchemeToggle, FontSizeToggle, ShowVersion} from "components/miscbuttons";
import { Label } from "./common";
const { TAURI, invoke } = await import(/* webpackChunkName: "taurishim" */"taurishim");

export interface InterfaceFormValues {
    interface: {
        theme?: ColorScheme,
        styleOverrides: StyleOverrides,
        skipAddDialog: boolean,
        deleteTorrentData: DeleteTorrentDataOption,
        progressbarStyle: ProgressbarStyleOption,
        numLastSaveDirs: number,
        preconfiguredLabels: string[],
        defaultTrackers: string[],
    },
}

export function InterfaceSettigsPanel<V extends InterfaceFormValues>(props: { form: UseFormReturnType<V> }) {
    const theme = useMantineTheme();
    const { style, setStyle } = useGlobalStyleOverrides();
    const [systemFonts, setSystemFonts] = useState<string[]>(["Default"]);

    useEffect(() => {
        if (TAURI) {
            invoke<string[]>("list_system_fonts").then((fonts) => {
                fonts.sort();
                setSystemFonts(["Default"].concat(fonts));
            }).catch(console.error);
        } else {
            setSystemFonts(["Default", "Arial", "Verdana", "Tahoma", "Roboto"]);
        }
    }, []);

    const { setFieldValue } = props.form as unknown as UseFormReturnType<InterfaceFormValues>;

    useEffect(() => {
        setFieldValue("interface.theme", theme.colorScheme);
    }, [setFieldValue, theme]);

    const setTextColor = useCallback((color: ColorSetting | undefined) => {
        const newStyle = { dark: { ...style.dark }, light: { ...style.light }, font: style.font };
        newStyle[theme.colorScheme].color = color;
        setStyle(newStyle);
        setFieldValue("interface.styleOverrides", newStyle);
    }, [style, theme.colorScheme, setStyle, setFieldValue]);

    const setBgColor = useCallback((backgroundColor: ColorSetting | undefined) => {
        const newStyle = { dark: { ...style.dark }, light: { ...style.light }, font: style.font };
        newStyle[theme.colorScheme].backgroundColor = backgroundColor;
        setStyle(newStyle);
        setFieldValue("interface.styleOverrides", newStyle);
    }, [style, theme.colorScheme, setStyle, setFieldValue]);

    const setFont = useCallback((font: string) => {
        const newStyle = {
            dark: { ...style.dark },
            light: { ...style.light },
            font: font === "Default" ? undefined : font,
        };
        setStyle(newStyle);
        setFieldValue("interface.styleOverrides", newStyle);
    }, [style, setStyle, setFieldValue]);

    const defaultColor = theme.colorScheme === "dark"
        ? { color: "dark", shade: 0, computed: theme.colors.dark[0] }
        : { color: "dark", shade: 9, computed: theme.colors.dark[9] };

    const defaultBg = theme.colorScheme === "dark"
        ? { color: "dark", shade: 7, computed: theme.colors.dark[7] }
        : { color: "gray", shade: 0, computed: theme.colors.gray[0] };

    const setPreconfiguredLabels = useCallback((labels: string[]) => {
        setFieldValue("interface.preconfiguredLabels", labels);
    }, [setFieldValue]);

    return (
        <Grid align="center">
            <Grid.Col span={2}>
                <div style={{ flexShrink: 0, display: "flex", order: 100 }}>
                    <ColorSchemeToggle />
                    <FontSizeToggle />
                </div>
            </Grid.Col>
            <Grid.Col span={1}>
                字体
            </Grid.Col>
            <Grid.Col span={3}>
                <NativeSelect data={systemFonts} value={style.font} onChange={(e) => { setFont(e.currentTarget.value); }} />
            </Grid.Col>
            <Grid.Col span={2}>
                字体颜色
            </Grid.Col>
            <Grid.Col span={1}>
                <ColorChooser value={style[theme.colorScheme].color ?? defaultColor} onChange={setTextColor} />
            </Grid.Col>
            <Grid.Col span={2}>
                背景颜色
            </Grid.Col>
            <Grid.Col span={1}>
                <ColorChooser value={style[theme.colorScheme].backgroundColor ?? defaultBg} onChange={setBgColor} />
            </Grid.Col>
            <Grid.Col span={3}>
                删除数据文件
            </Grid.Col>
            <Grid.Col span={3}>
                <NativeSelect data={DeleteTorrentDataOptions as unknown as string[]}
                    value={props.form.values.interface.deleteTorrentData}
                    onChange={(e) => { setFieldValue("interface.deleteTorrentData", e.target.value); }} />
            </Grid.Col>
            <Grid.Col span={6}>
                <Checkbox label="跳过添加种子对话框"
                    {...props.form.getInputProps("interface.skipAddDialog", { type: "checkbox" })} />
            </Grid.Col>
            <Grid.Col span={4}>保存的下载目录的最大数量</Grid.Col>
            <Grid.Col span={2}>
                <NumberInput
                    min={1}
                    max={100}
                    {...props.form.getInputProps("interface.numLastSaveDirs")} />
            </Grid.Col>
            <Grid.Col span={3}>进度条样式</Grid.Col>
            <Grid.Col span={3}>
                <NativeSelect data={ProgressbarStyleOptions as unknown as string[]}
                    value={props.form.values.interface.progressbarStyle}
                    onChange={(e) => { setFieldValue("interface.progressbarStyle", e.target.value); }} />
            </Grid.Col>
            <Grid.Col>
                <MultiSelect
                    data={props.form.values.interface.preconfiguredLabels}
                    value={props.form.values.interface.preconfiguredLabels}
                    onChange={setPreconfiguredLabels}
                    label="预配置标签"
                    withinPortal
                    searchable
                    creatable
                    getCreateLabel={(query) => `+ 新增 ${query}`}
                    onCreate={(query) => {
                        setPreconfiguredLabels([...props.form.values.interface.preconfiguredLabels, query]);
                        return query;
                    }}
                    valueComponent={Label}
                />
            </Grid.Col>
            <Grid.Col>
                <Textarea minRows={6}
                    label="默认Tracker列表(BT下载使用)"
                    value={props.form.values.interface.defaultTrackers.join("\n")}
                    onChange={(e) => {
                        props.form.setFieldValue(
                            "interface.defaultTrackers", e.currentTarget.value.split("\n") as any);
                    }} />
            </Grid.Col>
        </Grid>
    );
}
