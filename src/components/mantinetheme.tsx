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

import { ColorSchemeProvider, Global, MantineProvider, useMantineTheme } from "@mantine/core";
import type { ColorScheme, MantineThemeOverride } from "@mantine/core";
import { useColorScheme } from "@mantine/hooks";
import { ConfigContext } from "config";
import { FontsizeContextProvider, GlobalStyleOverridesContext, useFontSize, useGlobalStyleOverrides } from "themehooks";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";

const Theme: (colorScheme: ColorScheme, font?: string) => MantineThemeOverride = (colorScheme, font) => ({
    colorScheme,
    fontFamily: font ?? "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
    headings: {
        fontFamily: font ?? "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
    },
    components: {
        Table: {
            styles: {
                root: {
                    "& tbody tr td": {
                        padding: "0 0.5rem",
                    },
                },
            },
        },
        Checkbox: {
            styles: {
                input: {
                    ".selected &": {
                        boxShadow: "inset 0 0 3px 0 white",
                    },
                },
            },
        },
        Modal: {
            styles: {
                header: {
                    paddingRight: "0.5rem",
                },
            },
        },
    },
    colors: {
        turquoise: ["#dcfdff", "#b2f4fd", "#85ebf9", "#58e3f6", "#36d9f3", "#25c0d9", "#1696aa", "#066b7a", "#00404a", "#00171b"],
    },
    spacing: {
        xs: "0.3rem",
        sm: "0.4rem",
        md: "0.5rem",
        lg: "0.7rem",
        xl: "1rem",
    },
});

function GlobalStyles() {
    const theme = useMantineTheme();
    const fontSize = useFontSize();
    const { style } = useGlobalStyleOverrides();
    const overrides = style[theme.colorScheme];

    return (
        <Global styles={(theme) => ({
            html: {
                fontSize: `${fontSize.value}em`,
            },
            body: {
                color: overrides.color === undefined
                    ? undefined
                    : theme.colors[overrides.color.color][overrides.color.shade],
                backgroundColor: overrides.backgroundColor === undefined
                    ? undefined
                    : theme.colors[overrides.backgroundColor.color][overrides.backgroundColor.shade],
            },
            "::-webkit-scrollbar": {
                width: "0.75em",
                height: "0.75em",
            },
            "::-webkit-scrollbar-track": {
                backgroundColor: theme.colorScheme === "dark"
                    ? theme.fn.rgba(theme.colors.gray[7], 0.4)
                    : theme.fn.rgba(theme.colors.gray[5], 0.4),
            },
            "::-webkit-scrollbar-thumb": {
                backgroundColor: theme.colorScheme === "dark"
                    ? theme.colors.gray[7]
                    : theme.colors.gray[5],
                borderRadius: "0.375em",
                minHeight: "3rem",
                minWidth: "3rem",
            },
            "::-webkit-scrollbar-thumb:hover": {
                backgroundColor: theme.colorScheme === "dark"
                    ? theme.colors.gray[6]
                    : theme.colors.gray[6],
                border: "1px solid #77777744",
            },
            "::-webkit-scrollbar-corner": {
                backgroundColor: theme.colorScheme === "dark"
                    ? theme.fn.rgba(theme.colors.gray[7], 0.5)
                    : theme.fn.rgba(theme.colors.gray[5], 0.5),
            },
            "svg:not(:root)": {
                overflow: "visible",
            },
        })} />
    );
}

export default function CustomMantineProvider({ children }: { children: React.ReactNode }) {
    const config = useContext(ConfigContext);

    const preferredColorScheme = useColorScheme();
    const [colorScheme, setColorScheme] = useState<ColorScheme>(
        config.getTheme() ?? preferredColorScheme);

    const toggleColorScheme = useCallback((value?: ColorScheme) => {
        value = value ?? (colorScheme === "dark" ? "light" : "dark");
        config.setTheme(value);
        setColorScheme(value);
    }, [config, colorScheme]);

    const [style, setStyle] = useState(config.values.interface.styleOverrides);

    useEffect(() => {
        config.values.interface.styleOverrides = style;
    }, [config, style]);

    const theme = useMemo(() => {
        return Theme(colorScheme, style.font);
    }, [colorScheme, style.font]);

    return (
        <ColorSchemeProvider colorScheme={colorScheme} toggleColorScheme={toggleColorScheme}>
            <FontsizeContextProvider>
                <GlobalStyleOverridesContext.Provider value={{ style, setStyle }}>
                    <MantineProvider withGlobalStyles withNormalizeCSS theme={theme}>
                        <GlobalStyles />
                        {children}
                    </MantineProvider>
                </GlobalStyleOverridesContext.Provider>
            </FontsizeContextProvider>
        </ColorSchemeProvider>
    );
}
