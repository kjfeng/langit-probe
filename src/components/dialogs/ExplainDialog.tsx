import { closeModal } from '~/globals/modals.tsx';

import button from '~/styles/primitives/button.ts';
import * as dialog from '~/styles/primitives/dialog.ts';

export interface ExplainDialogProps {
	additive: string[];
	subtractive: string[];
}

const ExplainDialog = (props: ExplainDialogProps) => {
	let additive, subtractive;
	if (props.additive.length === 0) {
		additive = <span>Nothing yet...</span>;
	} else {
		additive = <ul class="ml-5 list-disc">
			{props.additive.map((item) => {
				return <li>{item}</li>;
			})}
		</ul>;
	}

	if (props.subtractive.length === 0) {
		subtractive = <span>Nothing yet...</span>;
	} else {
		subtractive = <ul class="ml-5 list-disc">
			{props.subtractive.map((item) => {
				return <li>{item}</li>;
			})}
		</ul>;
	}

	return (
		<div class={/* @once */ dialog.content()}>
			<h1 class={/* @once */ dialog.title() + " mb-2"}>Agent Knowledge</h1>
			<div class="mt-1 mb-1">
				<h2>⬆ Prioritize, as informed by:</h2>
				<div class="mt-1 text-sm text-muted-fg">{additive}</div>
			</div>

			<div class="mt-1 mb-1">
				<h2 class="mt-1">⬇ De-prioritize, as informed by:</h2>
				<p class="mt-1 text-sm text-muted-fg">{subtractive}</p>
			</div>




			<div class={/* @once */ dialog.actions()}>
				<button
					onClick={() => {
						closeModal();
					}}
					class={/* @once */ button({ color: 'primary' })}
				>
					Close
				</button>
			</div>
		</div>
	);
};

export default ExplainDialog;
