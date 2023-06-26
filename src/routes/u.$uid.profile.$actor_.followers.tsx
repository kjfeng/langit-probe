import { Show, createMemo } from 'solid-js';

import { createQuery } from '~/lib/solid-query/index.ts';

import { type DID } from '~/api/utils.ts';

import { getProfileFollowers, getProfileFollowersKey } from '~/api/queries/get-profile-followers.ts';

import { useParams } from '~/router.ts';

import ProfileList from '~/components/ProfileList.tsx';

const PAGE_SIZE = 30;

const AuthenticatedProfileFollowersPage = () => {
	const params = useParams('/u/:uid/profile/:actor/followers');

	const uid = () => params.uid as DID;

	const [followers, { refetch }] = createQuery({
		key: () => getProfileFollowersKey(uid(), params.actor, PAGE_SIZE),
		fetch: getProfileFollowers,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});

	const subject = createMemo(() => {
		return followers()?.pages[0].subject;
	});

	return (
		<div class="flex flex-col">
			<div class="sticky top-0 z-10 flex h-13 items-center border-b border-divider bg-background px-4">
				<div class="flex flex-col gap-0.5">
					<p class="text-base font-bold leading-5">Followers</p>

					<Show when={subject()}>
						{(subject) => <p class="text-xs text-muted-fg">@{subject().handle.value}</p>}
					</Show>
				</div>
			</div>

			<ProfileList uid={uid()} list={followers} onLoadMore={(cursor) => refetch(true, cursor)} />
		</div>
	);
};

export default AuthenticatedProfileFollowersPage;
