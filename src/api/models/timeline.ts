import type { DID, RefOf } from '@externdefs/bluesky-client/atp-schema';

import { type SignalizedPost, mergeSignalizedPost } from '../cache/posts.js';

import OpenAI from "openai";

type Post = RefOf<'app.bsky.feed.defs#postView'>;
type TimelineItem = RefOf<'app.bsky.feed.defs#feedViewPost'>;
type ReplyRef = RefOf<'app.bsky.feed.defs#replyRef'>;

// EnsuredTimelineItem
export interface EnsuredReplyRef {
	root: Post;
	parent: Post;
}

export const ensureReplyRef = (reply: ReplyRef | undefined): EnsuredReplyRef | undefined => {
	if (reply) {
		const root = reply.root;
		const parent = reply.parent;

		if (root.$type === 'app.bsky.feed.defs#postView' && parent.$type === 'app.bsky.feed.defs#postView') {
			return { root, parent };
		}
	}
};

export interface EnsuredTimelineItem {
	post: Post;
	reply?: EnsuredReplyRef;
	reason: TimelineItem['reason'];
}

export const ensureTimelineItem = (item: TimelineItem): EnsuredTimelineItem => {
	return {
		post: item.post,
		reply: ensureReplyRef(item.reply),
		reason: item.reason,
	};
};

// SignalizedTimelineItem
export interface SignalizedTimelineItem {
	post: SignalizedPost;
	reply?: {
		root: SignalizedPost;
		parent: SignalizedPost;
	};
	reason: TimelineItem['reason'];
}

export const mergeSignalizedTimelineItem = (
	uid: DID,
	item: EnsuredTimelineItem,
	key?: number,
): SignalizedTimelineItem => {
	const reply = item.reply;

	return {
		post: mergeSignalizedPost(uid, item.post, key),
		reply: reply && {
			root: mergeSignalizedPost(uid, reply.root, key),
			parent: mergeSignalizedPost(uid, reply.parent, key),
		},
		reason: item.reason,
	};
};

// TimelineSlice
export interface TimelineSlice {
	items: SignalizedTimelineItem[];
}

export type SliceFilter = (slice: TimelineSlice) => boolean | TimelineSlice[];
export type PostFilter = (item: EnsuredTimelineItem) => boolean;

const isNextInThread = (slice: TimelineSlice, item: EnsuredTimelineItem) => {
	const items = slice.items;
	const last = items[items.length - 1];

	const reply = item.reply;

	return !!reply && last.post.cid.peek() == reply.parent.cid;
};

const isFirstInThread = (slice: TimelineSlice, item: EnsuredTimelineItem) => {
	const items = slice.items;
	const first = items[0];

	const reply = first.reply;

	return !!reply && reply.parent.cid.peek() === item.post.cid;
};

const isArray = Array.isArray;

export const createTimelineSlices = (
	uid: DID,
	arr: TimelineItem[],
	filterSlice?: SliceFilter,
	filterPost?: PostFilter,
): TimelineSlice[] => {
	const key = Date.now();

	let slices: TimelineSlice[] = [];
	let jlen = 0;

	// arrange the posts into connected slices
	loop: for (let i = arr.length - 1; i >= 0; i--) {
		const item = ensureTimelineItem(arr[i]);

		if (filterPost && !filterPost(item)) {
			continue;
		}

		// find a slice that matches,
		const signalized = mergeSignalizedTimelineItem(uid, item, key);

		// if we find a matching slice and it's currently not in front, then bump
		// it to the front. this is so that new reply don't get buried away because
		// there's multiple posts separating it and the parent post.
		for (let j = 0; j < jlen; j++) {
			const slice = slices[j];

			if (isFirstInThread(slice, item)) {
				slice.items.unshift(signalized);

				if (j !== 0) {
					slices.splice(j, 1);
					slices.unshift(slice);
				}

				continue loop;
			} else if (isNextInThread(slice, item)) {
				slice.items.push(signalized);

				if (j !== 0) {
					slices.splice(j, 1);
					slices.unshift(slice);
				}

				continue loop;
			}
		}

		slices.unshift({ items: [signalized] });
		jlen++;
	}

	if (filterSlice && jlen > 0) {
		const unfiltered = slices;
		slices = [];

		for (let j = 0; j < jlen; j++) {
			const slice = unfiltered[j];
			const result = filterSlice(slice);

			if (result) {
				if (isArray(result)) {
					for (let k = 0, klen = result.length; k < klen; k++) {
						const slice = result[k];
						slices.push(slice);
					}
				} else {
					slices.push(slice);
				}
			}
		}
	}

	return slices;
};

export const createUnjoinedSlices = (
	uid: DID,
	arr: TimelineItem[],
	filterPost?: PostFilter,
): TimelineSlice[] => {
	const key = Date.now();
	const slices: TimelineSlice[] = [];

	for (let idx = 0, len = arr.length; idx < len; idx++) {
		const item = ensureTimelineItem(arr[idx]);

		if (filterPost && !filterPost(item)) {
			continue;
		}

		const signalized = mergeSignalizedTimelineItem(uid, item, key);

		slices.push({ items: [signalized] });
	}

	return slices;
};

const openai = new OpenAI({
	apiKey: import.meta.env.VITE_API_KEY,
	dangerouslyAllowBrowser: true
});

const sliceToNL = (item: TimelineSlice): string => {
	let text = item.items[0].post.record.value.text
	let time = item.items[0].post.record.value.createdAt
	let authorAndHandle = item.items[0].post.author.displayName.value + " (" + item.items[0].post.author.handle.value + ")"

	let fullText = authorAndHandle + " posted at " + time + " and said: " + text
	return fullText
}

export const filterSlicesWithLLM = async (
	slice: TimelineSlice[],
	userTextInput: string
): Promise<TimelineSlice[]>  => {
	let sliceCopy = slice.slice()
	let nlSlice = sliceCopy.map(sliceToNL)
	let dataPrompt = ""

	console.log("user input sent to LLM: " + userTextInput)

	for (let i = 0; i < nlSlice.length; i++) {
		dataPrompt += "Post " + i + ": " + nlSlice[i] + "\n\n"
	}

	let systemPrompt = `You are a bot on social media feeds that filters posts based on user preferences. The user has stated their preference as: ${userTextInput}. You are given a series of posts from a feed and you will identify posts that should be removed. When the user wants less  or fewer of something, reduce it but make sure to not remove it completely.  Posts should only be removed if they strongly conflict with user preferences. They stay if you think the user will not be strongly opposed to it.\n\nYou will refer to posts by the post number (just the number, no words). If you identify posts that should be removed, give me a list of post numbers, separated by commas, corresponding to those you think should be removed. If you think all the posts should stay, tell me \"None\". Do not respond with anything other than a list of comma-separated numbers or \"None\".`

	let data = await openai.chat.completions.create({
		messages: [{"role": "system", "content": systemPrompt},
			{"role": "user", "content": dataPrompt}],
		model: "gpt-4",
	})

	let responseText = data.choices[0].message.content
	console.log("LLM response: " + responseText)

	if (!responseText || responseText === "None") {
		return slice
	}

	let response = responseText.split(", ").map((x) => parseInt(x))
	let returnSlice = []
	for (let i = 0; i < response.length; i++) {
		let index = response[i]
		// validate indexes from LLM output
		if (!index || index < 0 || index >= sliceCopy.length) {
			// remove from array
			response.splice(response.indexOf(index), 1)
		}
	}
	for (let i = 0; i < sliceCopy.length; i++) {
		if (!response.includes(i)) {
			returnSlice.push(sliceCopy[i])
		}
	}

	return returnSlice
}
