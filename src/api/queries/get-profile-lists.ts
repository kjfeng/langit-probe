import { type EnhancedResource, type QueryFn } from '@intrnl/sq';

import { multiagent } from '~/globals/agent.ts';

import { mergeSignalizedList } from '../cache/lists.ts';
import { type ListsPage } from '../models/list.ts';

import { type BskyGetListsResponse } from '../types.ts';
import { type Collection, type DID, pushCollection } from '../utils.ts';

export type ProfileListsResource = EnhancedResource<Collection<ListsPage>, string>;

const PAGE_SIZE = 30;

export const getProfileListsKey = (uid: DID, actor: string, limit: number = PAGE_SIZE) =>
	['getProfileLists', uid, actor, limit] as const;
export const getProfileLists: QueryFn<
	Collection<ListsPage>,
	ReturnType<typeof getProfileListsKey>,
	string
> = async (key, { data: collection, param }) => {
	const [, uid, actor, limit] = key;

	const agent = await multiagent.connect(uid);

	const response = await agent.rpc.get({
		method: 'app.bsky.graph.getLists',
		params: { actor, limit, cursor: param },
	});

	const data = response.data as BskyGetListsResponse;

	const page: ListsPage = {
		cursor: data.lists.length >= limit ? data.cursor : undefined,
		lists: data.lists.map((list) => mergeSignalizedList(list)),
	};

	return pushCollection(collection, page, param);
};
