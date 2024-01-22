import type { DID, RefOf } from '@externdefs/bluesky-client/atp-schema';

import { type SignalizedPost, mergeSignalizedPost } from '../cache/posts.js';

import OpenAI from "openai";

const MODEL = "gpt-4-1106-preview"

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

export interface InputCategorization {
	additive: string;
	subtractive: string;
}

export interface JSONSliceItem {
	id: string;
	bodyText: string;
	time: string;
	author: string | undefined;
	handle: string;
	repost: boolean;
	repostAuthor?: string | undefined;
	repostHandle?: string;
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
	if (item.items[0].reason && item.items[0].reason.$type === 'app.bsky.feed.defs#reasonRepost') {
		let repostAuthorAndHandle = item.items[0].reason.by.displayName + " (" + item.items[0].reason.by.handle + ")"
		fullText += ". This was reposted by " + repostAuthorAndHandle
	}

	return fullText
}

const slicetoJSON = (item: TimelineSlice): JSONSliceItem => {
	let text = item.items[0].post.record.value.text
	let time = item.items[0].post.record.value.createdAt
	let author = item.items[0].post.author.displayName.value
	let handle = item.items[0].post.author.handle.value

	// assign any type to dynamically add keys
	let sliceObj: JSONSliceItem = {id: "", bodyText: text, time: time, author: author, handle: handle, repost: false}

	if (item.items[0].reason && item.items[0].reason.$type === 'app.bsky.feed.defs#reasonRepost') {
		sliceObj.repost = true
		sliceObj.repostAuthor = item.items[0].reason.by.displayName
		sliceObj.repostHandle = item.items[0].reason.by.handle
	}

	return sliceObj
}

export const filterSlicesWithLLM = async (
	slice: TimelineSlice[],
	userTextInput: string
): Promise<TimelineSlice[]>  => {
	let sliceCopy = slice.slice()
	let nlSlice = sliceCopy.map(sliceToNL)
	let dataPrompt = ""

	console.log("user input sent to LLM (subtractive): " + userTextInput)

	for (let i = 0; i < nlSlice.length; i++) {
		dataPrompt += "Post " + i + ": " + nlSlice[i] + "\n\n"
	}

	let systemPrompt = `You are a bot on social media feeds that filters posts based on user preferences. The user has stated their preference as: ${userTextInput}. You are given a series of posts from a feed and you will identify posts that should be removed. When the user wants less  or fewer of something, reduce it but make sure to not remove it completely.  Posts should only be removed if they strongly conflict with user preferences. They stay if you think the user will not be strongly opposed to it.\n\nYou will refer to posts by the post number (just the number, no words). If you identify posts that should be removed, give me a list of post numbers, separated by commas, corresponding to those you think should be removed. If you think all the posts should stay, tell me \"None\". Do not respond with anything other than a list of comma-separated numbers or \"None\".`

	let data = await openai.chat.completions.create({
		messages: [{"role": "system", "content": systemPrompt},
			{"role": "user", "content": dataPrompt}],
		model: MODEL,
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

export const filterSlicesWithLLM_json = async (
	slice: TimelineSlice[],
	userTextInput: string
): Promise<{returnSlice: TimelineSlice[], removedIndices: number[]}>  => {
	let sliceCopy = slice.slice()
	let jsonSlice = sliceCopy.map(slicetoJSON)

	console.log("user input sent to LLM (subtractive): " + userTextInput)

	for (let i = 0; i < jsonSlice.length; i++) {
		jsonSlice[i].id = "" + i
	}

	let systemPrompt = `You are a bot on social media feeds that filters posts based on user preferences. You are given a series of posts from a feed as a JSON array. Each element in the array represents one post and its associated metadata. You will identify posts that should be removed based on stated user preferences and remove those corresponding elements in the JSON array. This will be filtered array. When removing each post, keep track of the array index of each removed post. This will be the removed indices array.

	When the user specifies they want less or fewer of something, reduce it but make sure to not remove it completely.  Posts should only be removed if they strongly conflict with user preferences. They stay if you think the user will not be strongly opposed to it. If you believe there is nothing to be removed, the filtered array will just be the same as the input JSON array.

	You will return a stringified JSON object with two fields, returnSlice and removedIndices. The returnSlice field should be the filtered array. The removedIndices should be the removed indices array containing original indices of removed posts. Don't apply formatting with backticks, just start and end your response with curly braces from the JSON object.`

	let dataPrompt = `The user’s stated preference is: ${userTextInput}. The JSON array is: ${JSON.stringify(jsonSlice)}}`

	let data = await openai.chat.completions.create({
		messages: [{"role": "system", "content": systemPrompt},
			{"role": "user", "content": dataPrompt}],
		model: MODEL,
	})

	let responseText = data.choices[0].message.content
	console.log("LLM response: " + responseText)

	if (!responseText) {
		return {returnSlice: slice, removedIndices: []}
	}

	let returnSliceObj = JSON.parse(responseText)

	if (returnSliceObj.returnSlice && returnSliceObj.removedIndices) {
		return returnSliceObj
	} else {
		throw new Error("LLM response did not contain returnSlice or removedIndices")
	}
}

export const generateSearchQueriesWithLLM = async (
	userTextInput: string,
): Promise<string[]>  => {
	let dataPrompt = `You are a bot on a social media platform. The user will write you a message that reflects their preferences. You will take a message that the user writes to you and provide a search query that can then be used in a platform-wide search feature to return content that is more aligned with the user's preferences.

	Return a comma separated list of search terms. Do not include any other punctuation. Keep this list to at most 3 terms.

	The user's message is: ${userTextInput}

	The search query is:`

	console.log("user input sent to LLM (additive): " + userTextInput)

	// let systemPrompt = `You are a bot on social media feeds that filters posts based on user preferences. The user has stated their preference as: ${userTextInput}. You are given a series of posts from a feed and you will identify posts that should be removed. When the user wants less  or fewer of something, reduce it but make sure to not remove it completely.  Posts should only be removed if they strongly conflict with user preferences. They stay if you think the user will not be strongly opposed to it.\n\nYou will refer to posts by the post number (just the number, no words). If you identify posts that should be removed, give me a list of post numbers, separated by commas, corresponding to those you think should be removed. If you think all the posts should stay, tell me \"None\". Do not respond with anything other than a list of comma-separated numbers or \"None\".`

	let data = await openai.chat.completions.create({
		messages: [
			// {"role": "system", "content": systemPrompt},
			{"role": "user", "content": dataPrompt}
		],
		model: MODEL,
	})

	let responseText = data.choices[0].message.content
	console.log("LLM response: " + responseText)

	if (!responseText || responseText === "None") {
		return []
	}

	return responseText.split(", ")
}

export const classifyQueryWithLLM = async (
	userTextInput: string,
): Promise<string>  => {
	let dataPrompt = `You are a bot on a social media platform. The user will write you a message that reflects their preferences. You will take the user's message and classify it as a request to add more content to the feed (additive) or remove content from the feed (subtractive). That is, classify the query as either "additive" or "subtractive". Do not output anything other than "additive" or "subtractive".

	The user's message is: ${userTextInput}

	The classification is:`

	let data = await openai.chat.completions.create({
		messages: [
			// {"role": "system", "content": systemPrompt},
			{"role": "user", "content": dataPrompt}
		],
		model: MODEL,
	})

	let responseText = data.choices[0].message.content
	console.log("LLM classification of latest query: " + responseText)

	if (!responseText || responseText === "None") {
		return ""
	}

	return responseText
}

export const categorizeQueryWithLLM = async (
	userTextInput: string,
): Promise<InputCategorization> => {
	let systemPrompt = `You are a bot on a social media platform. The user will write you a message that reflects their preferences. This message may contain desires to remove content (which we will call subtractive desires) and add more content (which we will call additive desires). You will rewrite the user’s input as two strings to separate the additive and subtractive desires. Return a JSON object with two fields, “additive” and “subtractive”, with additive desires in the “additive” field and subtractive desires in the “subtractive” field.

	When rewriting, keep the same tone and style of writing as the original message. It is possible the user may only express one type of desire. If this is the case, assign an empty string to the desire not expressed by the user. Do not return anything except for the stringified JSON object with the two fields. Don't apply formatting with backticks, just start and end your response with curly braces from the JSON object.`

	let dataPrompt = `The user's message is: ${userTextInput}`

	let data = await openai.chat.completions.create({
		messages: [
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": dataPrompt}
		],
		model: MODEL,
	})

	let responseText = data.choices[0].message.content
	console.log("LLM categorization json: " + responseText)

	if (!responseText) {
		return {additive: "", subtractive: ""}
	}

	return JSON.parse(responseText)
}
