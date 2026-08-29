<script lang="ts">
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let {
		onSubmit,
		disabled = false,
		submitting = false
	}: {
		onSubmit: (body: string) => Promise<boolean>;
		disabled?: boolean;
		submitting?: boolean;
	} = $props();

	let body = $state('');
	let error = $state<string | null>(null);

	async function handleSubmit(event?: SubmitEvent) {
		if (event) event.preventDefault();
		const trimmed = body.trim();
		if (!trimmed) {
			error = 'Comment cannot be empty.';
			return;
		}
		error = null;
		const ok = await onSubmit(trimmed);
		if (ok) {
			body = '';
		} else {
			error = 'Could not add the comment. Please try again.';
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
			event.preventDefault();
			handleSubmit();
		}
	}
</script>

<form onsubmit={handleSubmit} class="space-y-2" aria-label="Add a comment">
	<div class="space-y-1.5">
		<div class="flex items-center justify-between">
			<Label for="comment-body">Add a comment</Label>
			<span class="text-muted-foreground text-xs font-mono">{body.length} / 1000</span>
		</div>
		<Textarea
			id="comment-body"
			placeholder="Write an update… (Ctrl+Enter to post)"
			rows={3}
			maxlength={1000}
			bind:value={body}
			onkeydown={handleKeydown}
			aria-invalid={error ? 'true' : undefined}
			disabled={disabled || submitting}
		/>
		{#if error}
			<p class="text-destructive text-sm" role="alert">{error}</p>
		{/if}
	</div>
	<div class="flex justify-end">
		<Button type="submit" size="sm" disabled={disabled || submitting}>
			{submitting ? 'Posting…' : 'Post comment'}
		</Button>
	</div>
</form>
