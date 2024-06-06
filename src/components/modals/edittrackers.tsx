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

import React, { useCallback, useContext, useEffect, useMemo } from "react";
import type { ModalState } from "./common";
import { SaveCancelModal, TorrentsNames } from "./common";
import { useForm } from "@mantine/form";
import { useMutateTorrent, useTorrentDetails } from "queries";
import { notifications } from "@mantine/notifications";
import { Button, Grid, LoadingOverlay, Text, Textarea } from "@mantine/core";
import { ConfigContext } from "config";
import type { TrackerStats } from "rpc/torrent";
import { useServerRpcVersion, useServerSelectedTorrents, useServerTorrentData } from "rpc/torrent";

interface FormValues {
    trackerList: string,
}

export function EditTrackers(props: ModalState) {
    const rpcVersion = useServerRpcVersion();
    const config = useContext(ConfigContext);
    const serverData = useServerTorrentData();
    const selected = useServerSelectedTorrents();

    const torrentId = useMemo(() => {
        if (serverData.current === undefined || !selected.has(serverData.current)) {
            return [...selected][0];
        }
        return serverData.current;
    }, [selected, serverData]);

    const { data: torrent, isLoading } = useTorrentDetails(
        torrentId ?? -1, torrentId !== undefined && props.opened, false, true);

    const form = useForm<FormValues>({});

    const { setValues } = form;
    useEffect(() => {
        if (torrent === undefined) return;
        setValues({
            trackerList: rpcVersion >= 17
                ? torrent.trackerList
                : torrent.trackerStats.map((s: TrackerStats) => s.announce).join("\n"),
        });
    }, [rpcVersion, setValues, torrent]);

    const { mutate } = useMutateTorrent();

    const onSave = useCallback(() => {
        if (torrentId === undefined || torrent === undefined) return;
        const dedupedTrackers: string[] = [];
        for (const tracker of form.values.trackerList.split("\n")) {
            if (tracker !== "" && dedupedTrackers.includes(tracker)) continue;
            if (tracker === "" && dedupedTrackers.length === 0) continue;
            if (tracker === "" && dedupedTrackers[dedupedTrackers.length - 1] === "") continue;
            dedupedTrackers.push(tracker);
        }
        let toAdd;
        let toRemove;
        if (rpcVersion < 17) {
            const trackers = dedupedTrackers.filter((s) => s !== "");
            const currentTrackers = Object.fromEntries(
                torrent.trackerStats.map((s: TrackerStats) => [s.announce, s.id]));

            toAdd = trackers.filter((t) => !Object.prototype.hasOwnProperty.call(currentTrackers, t));
            toRemove = (torrent.trackerStats as TrackerStats[])
                .filter((s: TrackerStats) => !trackers.includes(s.announce))
                .map((s: TrackerStats) => s.id as number);
            if (toAdd.length === 0) toAdd = undefined;
            if (toRemove.length === 0) toRemove = undefined;
        }
        mutate(
            {
                torrentIds: [...selected],
                fields: {
                    trackerList: dedupedTrackers.join("\n"),
                    trackerAdd: toAdd,
                    trackerRemove: toRemove,
                },
            },
            {
                onError: (e) => {
                    console.error("Failed to update torrent properties", e);
                    notifications.show({
                        message: "Error updating torrent",
                        color: "red",
                    });
                },
            },
        );
        props.close();
    }, [torrentId, torrent, rpcVersion, mutate, selected, form.values, props]);

    const addDefaultTrackers = useCallback(() => {
        let list = form.values.trackerList;
        if (!list.endsWith("\n")) list += "\n";
        list += config.values.interface.defaultTrackers.join("\n");
        form.setFieldValue("trackerList", list);
    }, [config, form]);

    return <>{props.opened &&
        <SaveCancelModal
            opened={props.opened}
            size="xl"
            onClose={props.close}
            onSave={onSave}
            centered
            title="修改种子Tracker"
            h="25rem"
        >
            <LoadingOverlay visible={isLoading} />
            <Grid align="center">
                <Grid.Col>
                    <TorrentsNames />
                </Grid.Col>
                <Grid.Col span={8}>
                    <Text>Tracker列表，一行一个</Text>
                </Grid.Col>
                <Grid.Col span={4}>
                    <Button onClick={addDefaultTrackers}>追加默认Trackers</Button>
                </Grid.Col>
                <Grid.Col>
                    <Textarea minRows={10} wrap={"off"} style={ {overflow: "auto"} }
                        {...form.getInputProps("trackerList")} />
                </Grid.Col>
            </Grid>
        </SaveCancelModal>}
    </>;
}
