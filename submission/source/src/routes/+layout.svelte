<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import AppHeader from '$lib/components/app/app-header.svelte';
	import AppSidebar from '$lib/components/app/app-sidebar.svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { getSession, signOut } from '$lib/stores/auth.svelte';

	let { children } = $props();

	const user = $derived(getSession());
	const showShell = $derived(!!user && page.url.pathname !== '/login');

	const IDLE_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

	$effect(() => {
		if (!showShell || !user) return;

		let timeoutId: ReturnType<typeof setTimeout>;

		function resetTimer() {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(async () => {
				toast.warning('Session locked due to inactivity on shared device.');
				await signOut();
				await goto('/login', { replaceState: true });
			}, IDLE_TIMEOUT_MS);
		}

		const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
		for (const ev of events) {
			window.addEventListener(ev, resetTimer, { passive: true });
		}
		resetTimer();

		return () => {
			clearTimeout(timeoutId);
			for (const ev of events) {
				window.removeEventListener(ev, resetTimer);
			}
		};
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<Toaster position="bottom-right" richColors />
<div class={showShell ? 'bg-muted/30 flex min-h-svh flex-col' : 'contents'}>
	{#if showShell && user}
		<AppHeader {user} />
	{/if}
	<div class={showShell ? 'flex min-h-0 flex-1' : 'contents'}>
		{#if showShell && user}
			<AppSidebar {user} />
		{/if}
		<div class={showShell ? 'min-w-0 flex-1 overflow-auto p-4 sm:p-6' : 'contents'}>
			{@render children()}
		</div>
	</div>
</div>
