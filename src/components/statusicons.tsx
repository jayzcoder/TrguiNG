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

import { useMantineTheme } from "@mantine/core";
import React from "react";
import * as Icon from "react-bootstrap-icons";
import { Status } from "rpc/transmission";
import ActiveIcon from "svg/icons/active.svg";
import PausedIcon from "svg/icons/paused.svg";

export function All() {
    const theme = useMantineTheme();
    return <Icon.Asterisk size="1rem" stroke={theme.colors.orange[3]} fill={theme.colors.yellow[3]} />;
}

export function Downloading() {
    const theme = useMantineTheme();
    return <Icon.CaretDownSquareFill size="1rem" fill={theme.colors.indigo[4]} />;
}

export function Completed() {
    const theme = useMantineTheme();
    return <Icon.CaretUpSquareFill size="1rem" fill={theme.colors.green[7]} />;
}

export function Active() {
    const theme = useMantineTheme();
    return <ActiveIcon width="1rem" height="1rem" fill={theme.colors.red[6]} />;
}

export function Inactive() {
    const theme = useMantineTheme();
    return <Icon.Snow size="1rem" fill={theme.colors.cyan[4]} />;
}

export function Running() {
    const theme = useMantineTheme();
    return <Icon.CaretRightSquareFill size="1rem" fill={theme.colors.lime[7]} />;
}

export function Stopped() {
    const theme = useMantineTheme();
    return <PausedIcon width="1rem" height="1rem" fill={theme.colors.yellow[6]} />;
}

export function StoppedDone() {
    const theme = useMantineTheme();
    return <Icon.CircleFill size="1rem" fill={theme.colors.green[6]} />;
}

export function StoppedUndone() {
    const theme = useMantineTheme();
    return <Icon.CircleHalf width="1rem" height="1rem" fill={theme.colors.red[6]} />;
}

export function Error() {
    const theme = useMantineTheme();
    return <Icon.XSquareFill size="1rem" fill={theme.colors.red[6]} />;
}

export function Waiting() {
    const theme = useMantineTheme();
    return <Icon.ClockFill size="1rem" fill={theme.colors.cyan[4]} />;
}

export function Label() {
    const theme = useMantineTheme();
    return <Icon.TagsFill size="1rem" stroke={theme.colors.indigo[9]} fill={theme.colors.blue[4]} />;
}

export function Tracker() {
    const theme = useMantineTheme();
    return <Icon.Wifi size="1rem" stroke={theme.colors.indigo[9]} fill={theme.colors.blue[4]} />;
}

export function Magnetizing() {
    const theme = useMantineTheme();
    return <Icon.MagnetFill size="1rem" fill={theme.colors.indigo[4]} />;
}

export function CompletedStopped() {
    const theme = useMantineTheme();
    return <Icon.CheckSquareFill size="1rem" fill={theme.colors.green[9]} />;
}

export const StatusIconMap: Record<number, React.FC> = {
    [Status.stopped]: Stopped,
    [Status.queuedToVerify]: Waiting,
    [Status.queuedToDownload]: Waiting,
    [Status.queuedToSeed]: Waiting,
    [Status.verifying]: Waiting,
    [Status.downloading]: Downloading,
    [Status.seeding]: Completed,
} as const;
