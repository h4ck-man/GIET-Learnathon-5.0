<script lang="ts">
	import type { User } from '$lib/types';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { signOut } from '$lib/stores/auth.svelte';
	import { activeNavHref, shellNav } from '$lib/components/app/shell-nav';
	import ShellNavLinks from '$lib/components/app/shell-nav-links.svelte';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import SchoolIcon from '@lucide/svelte/icons/school';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import LockIcon from '@lucide/svelte/icons/lock';
	import KeyIcon from '@lucide/svelte/icons/key';
	import CheckCircleIcon from '@lucide/svelte/icons/check-circle';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';

	let { user }: { user: User } = $props();

	const isStudent = $derived(user.role === 'student');
	const nav = $derived(shellNav(user.role));
	const activeHref = $derived(activeNavHref(page.url.pathname, nav));
	let mobileOpen = $state(false);
	let securityDialogOpen = $state(false);
	let isDark = $state(false);

	function toggleTheme() {
		isDark = !isDark;
		if (typeof document !== 'undefined') {
			document.documentElement.classList.toggle('dark', isDark);
		}
	}

	async function handleSignOut() {
		mobileOpen = false;
		await signOut();
		await goto('/login', { replaceState: true });
	}
</script>

<header
	class="bg-card sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b px-4 sm:px-6"
>
	<div class="flex items-center gap-2">
		<Sheet.Root bind:open={mobileOpen}>
			<Sheet.Trigger
				class="hover:bg-muted -ml-2 inline-flex size-9 items-center justify-center rounded-md md:hidden"
				aria-label="Open navigation menu"
			>
				<MenuIcon class="size-5" />
			</Sheet.Trigger>
			<Sheet.Content side="left" class="w-64">
				<Sheet.Header class="sr-only">
					<Sheet.Title>Navigation</Sheet.Title>
					<Sheet.Description>Main navigation menu</Sheet.Description>
				</Sheet.Header>
				<nav class="mt-4 flex flex-col gap-1 px-3" aria-label="Main navigation">
					<ShellNavLinks items={nav} {activeHref} onNavigate={() => (mobileOpen = false)} />
				</nav>
			</Sheet.Content>
		</Sheet.Root>
		<a href={isStudent ? '/student' : '/warden'} class="flex items-center gap-2 font-semibold">
			<SchoolIcon class="size-5" aria-hidden="true" />
			<span>HostelGrievance</span>
			<span class="text-muted-foreground hidden text-sm font-normal sm:inline">
				· GIET University
			</span>
		</a>
	</div>
	<div class="flex items-center gap-2 sm:gap-3">
		<!-- Live Security & Privacy Status Badge -->
		<Button
			variant="ghost"
			size="sm"
			class="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700 dark:text-emerald-400 hidden items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium sm:flex"
			onclick={() => (securityDialogOpen = true)}
			title="View Security & Protection Status"
		>
			<ShieldCheckIcon class="size-3.5" />
			<span>Protected</span>
		</Button>

		<!-- Theme Toggle Button -->
		<Button
			variant="ghost"
			size="sm"
			class="size-8 p-0"
			onclick={toggleTheme}
			aria-label="Toggle theme"
			title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
		>
			{#if isDark}
				<SunIcon class="size-4 text-amber-500" />
			{:else}
				<MoonIcon class="size-4 text-muted-foreground" />
			{/if}
		</Button>

		<div class="text-right">
			<p class="text-sm leading-tight font-medium">{user.name}</p>
			<p class="text-muted-foreground text-xs leading-tight capitalize">{user.role}</p>
		</div>
		<Button variant="outline" size="sm" onclick={handleSignOut}>
			<LogOutIcon class="size-4" />
			<span class="hidden sm:inline">Sign out</span>
		</Button>
	</div>
</header>

<!-- Security Center Dialog -->
<Dialog.Root bind:open={securityDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-base">
				<ShieldCheckIcon class="text-emerald-600 dark:text-emerald-400 size-5" />
				Security & Privacy Architecture
			</Dialog.Title>
			<Dialog.Description class="text-xs">
				Real-time security controls active for your university session.
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-3 py-2 text-sm">
			<div class="bg-muted/50 flex items-start gap-2.5 rounded-lg border p-2.5">
				<LockIcon class="text-primary mt-0.5 size-4 shrink-0" />
				<div>
					<p class="font-medium text-xs">Server-Authoritative Tenant Isolation</p>
					<p class="text-muted-foreground text-xs leading-relaxed">
						Grievances, comments, and attachments are strictly locked to the authenticated ticket owner and hostel wardens.
					</p>
				</div>
			</div>

			<div class="bg-muted/50 flex items-start gap-2.5 rounded-lg border p-2.5">
				<KeyIcon class="text-primary mt-0.5 size-4 shrink-0" />
				<div>
					<p class="font-medium text-xs">Cryptographic Session & Password Protection</p>
					<p class="text-muted-foreground text-xs leading-relaxed">
						Protected with HttpOnly/SameSite cookies, 100,000-round PBKDF2 password hashing, and atomic server-side session invalidation on logout.
					</p>
				</div>
			</div>

			<div class="bg-muted/50 flex items-start gap-2.5 rounded-lg border p-2.5">
				<CheckCircleIcon class="text-emerald-600 dark:text-emerald-400 mt-0.5 size-4 shrink-0" />
				<div>
					<p class="font-medium text-xs">Binary-Level File Upload Inspection</p>
					<p class="text-muted-foreground text-xs leading-relaxed">
						Attachments are validated via raw magic-byte signatures and stored with randomized cryptographic filenames.
					</p>
				</div>
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" size="sm" onclick={() => (securityDialogOpen = false)}>
				Close
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
