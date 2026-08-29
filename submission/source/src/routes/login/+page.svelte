<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { signIn } from '$lib/stores/auth.svelte';
	import SchoolIcon from '@lucide/svelte/icons/school';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';

	let email = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let error = $state<string | null>(null);
	let submitting = $state(false);
	let cooldownSeconds = $state(0);

	const passwordStrength = $derived.by(() => {
		if (!password) return null;
		if (password.length < 8) return { label: 'Weak (< 8 chars)', color: 'text-amber-500' };
		const hasNum = /\d/.test(password);
		const hasSpecial = /[^A-Za-z0-9]/.test(password);
		if (hasNum && hasSpecial) return { label: 'Strong (Complex)', color: 'text-emerald-500' };
		return { label: 'Moderate', color: 'text-blue-500' };
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (cooldownSeconds > 0) return;
		error = null;

		if (!email.trim()) {
			error = 'Email is required.';
			return;
		}
		if (!password) {
			error = 'Password is required.';
			return;
		}

		submitting = true;
		const result = await signIn(email, password);
		submitting = false;

		if (result.ok) {
			// getSession() is already updated; route guard redirects by role.
			const { getSession } = await import('$lib/stores/auth.svelte');
			const user = getSession();
			await goto(user?.role === 'warden' ? '/warden' : '/student', { replaceState: true });
		} else {
			password = ''; // Clear password field on error
			error = result.error ?? 'Sign-in failed. Please try again.';
			if (error.toLowerCase().includes('too many') || error.toLowerCase().includes('rate limit')) {
				cooldownSeconds = 30;
				const timer = setInterval(() => {
					cooldownSeconds -= 1;
					if (cooldownSeconds <= 0) clearInterval(timer);
				}, 1000);
			}
		}
	}
</script>

<svelte:head><title>Sign in · HostelGrievance</title></svelte:head>

<main class="bg-muted/30 flex min-h-screen items-center justify-center p-4">
	<div class="w-full max-w-sm">
		<div class="mb-6 flex flex-col items-center text-center">
			<span
				class="bg-primary text-primary-foreground mb-3 flex size-11 items-center justify-center rounded-lg"
				aria-hidden="true"
			>
				<SchoolIcon class="size-6" />
			</span>
			<h1 class="text-xl font-semibold tracking-tight">HostelGrievance</h1>
			<p class="text-muted-foreground mt-1 text-sm">GIET University · Hostel Administration</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>Sign in</CardTitle>
				<CardDescription>Use your university account to continue.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onsubmit={handleSubmit} class="space-y-4" novalidate>
					<div class="space-y-1.5">
						<Label for="email">Email</Label>
						<Input
							id="email"
							type="email"
							maxlength={254}
							autocomplete="username"
							placeholder="you@giet.edu"
							bind:value={email}
							aria-invalid={error ? 'true' : undefined}
						/>
					</div>
					<div class="space-y-1.5">
						<div class="flex items-center justify-between">
							<Label for="password">Password</Label>
							{#if passwordStrength}
								<span class="text-xs font-medium {passwordStrength.color}">
									{passwordStrength.label}
								</span>
							{/if}
						</div>
						<div class="relative">
							<Input
								id="password"
								type={showPassword ? 'text' : 'password'}
								maxlength={128}
								autocomplete="current-password"
								placeholder="••••••••"
								class="pr-10"
								bind:value={password}
								aria-invalid={error ? 'true' : undefined}
							/>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								class="absolute top-0 right-0 h-full px-3 py-2 hover:bg-transparent text-muted-foreground hover:text-foreground"
								onclick={() => (showPassword = !showPassword)}
								aria-label={showPassword ? 'Hide password' : 'Show password'}
							>
								{#if showPassword}
									<EyeOffIcon class="size-4" />
								{:else}
									<EyeIcon class="size-4" />
								{/if}
							</Button>
						</div>
					</div>

					{#if error}
						<p class="text-destructive text-sm" role="alert">{error}</p>
					{/if}

					<Button type="submit" class="w-full" disabled={submitting || cooldownSeconds > 0}>
						{#if cooldownSeconds > 0}
							Cooldown ({cooldownSeconds}s)
						{:else if submitting}
							Signing in…
						{:else}
							Sign in
						{/if}
					</Button>
				</form>
			</CardContent>
		</Card>

		<p class="text-muted-foreground mt-6 text-center text-xs leading-relaxed">
			Demo environment — development credentials only:<br />
			Student: student@example.test / student123<br />
			Warden: warden@example.test / warden123
		</p>
	</div>
</main>
