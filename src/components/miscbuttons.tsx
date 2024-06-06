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

import type { MantineNumberSize } from "@mantine/core";
import { ActionIcon, useMantineColorScheme } from "@mantine/core";
import * as Icon from "react-bootstrap-icons";
import FontSizeIcon from "svg/icons/fontsize.svg";
import React from "react";
import { VersionModal } from "components/modals/version";
import { useDisclosure, useHotkeys } from "@mantine/hooks";
import { modKeyString } from "trutil";
import { useFontSize } from "themehooks";

export function ColorSchemeToggle(props: { sz?: string, btn?: MantineNumberSize }) {
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const dark = colorScheme === "dark";

    useHotkeys([
        ["mod + U", () => { toggleColorScheme(); }],
    ]);

    return (
        <ActionIcon
            variant="default"
            size={props.btn}
            onClick={() => { toggleColorScheme(); }}
            title={`切换主题 (${modKeyString()} + U)`}
            my="auto"
        >
            {dark
                ? <Icon.Sun size={props.sz} color="yellow" />
                : <Icon.MoonStars size={props.sz} color="blue" />}
        </ActionIcon>
    );
}

export function ShowVersion(props: { sz?: string, btn?: MantineNumberSize }) {
    const [showVersionModal, { open: openVersionModal, close: closeVersionModal }] = useDisclosure(false);

    return (
        <>
            <VersionModal opened={showVersionModal} close={closeVersionModal} />
            <ActionIcon
                size={props.btn}
                onClick={openVersionModal}
                title="版本信息"
                ml="auto" my="auto"
            >
                <Icon.InfoCircle size={props.sz} />
            </ActionIcon>
        </>
    );
}

export function FontSizeToggle(props: { sz?: string, btn?: MantineNumberSize }) {
    const { toggle } = useFontSize();

    useHotkeys([
        ["mod + =", () => { toggle(); }],
    ]);

    return (
        <ActionIcon
            variant="default"
            size={props.btn}
            onClick={() => { toggle(); }}
            title={`调整字体大小 (${modKeyString()} + =)`}
            my="auto"
        >
            <FontSizeIcon width="1.1rem" height="1.1rem" fill="currentColor" />
        </ActionIcon>
    );
}
