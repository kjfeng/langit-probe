// import CloseIcon from '~/icons/baseline-close';
import CheckIcon from '~/icons/baseline-check';
import { createSignal } from 'solid-js';

export interface FeedbackInputProps {
	value?: string;
	placeholder?: string;
	onEnter: (next: string) => void;
}

export interface ChipProps {
	chipText: string;
}



const FeedbackInput = (props: FeedbackInputProps) => {
	const [chipValue, setChipValue] = createSignal<string>("");
	const [outlineColor, setOutlineColor] = createSignal<string>("accent");
	// createEffect(() => {
	// 	props.value = chipValue();
	// });

	const Chip = (props: ChipProps) => {
		let chipDisplayString = props.chipText.concat("...");
		return (
			<div class="whitespace-nowrap">
				<button
					class="text-xs text-muted-fg border p-1 m-1 rounded-md hover:text-accent"
					onClick={() => {
						setChipValue(props.chipText);
					}}
				>
					{chipDisplayString}
				</button>
			</div>

		);
	}
	return (
		<div class="w-full">
			<div class="flex my-1 overflow-x-auto">
				<Chip chipText="I want to see more of " />
				<Chip chipText="I want to see less of " />
				<Chip chipText="Tell me about " />
				<Chip chipText="Don't show me " />
			</div>


			<div class={`flex h-8 grow rounded-full bg-hinted outline-2 -outline-offset-1 outline-${outlineColor()} outline-none focus-within:outline dark:bg-[#202327]`}>
				<input
					type="text"
					value={chipValue() ?? ''}
					placeholder={props.placeholder ?? 'Type your preferences...'}
					onKeyDown={(ev) => {
						const value = ev.currentTarget.value;

						if (ev.key === 'Enter' && value) {
							props.onEnter(value);
							setOutlineColor("[#059669]")
						} else {
							setOutlineColor("accent")
						}
					}}
					// onBlur={(ev) => {
					// 	const value = ev.currentTarget.value;
					// 	// make sure input is not empty
					// 	if (value !== '.') {
					// 		props.onEnter(value);
					// 	}
					// }}
					class="peer grow bg-transparent pl-4 text-sm text-primary outline-none placeholder:text-muted-fg"

				/>

				<button
					onClick={(ev) => {
						const btn = ev.currentTarget;
						const input = btn.parentElement?.querySelector('input');

						if (input && input.value) {
							props.onEnter(input.value);
							setOutlineColor("[#059669]")
						} else {
							setOutlineColor("accent")
						}
					}}
					class="pl-2 pr-2 text-muted-fg hover:text-primary peer-placeholder-shown:hidden"
				>
					<CheckIcon />
				</button>
			</div>
		</div>

	);
};

export default FeedbackInput;
