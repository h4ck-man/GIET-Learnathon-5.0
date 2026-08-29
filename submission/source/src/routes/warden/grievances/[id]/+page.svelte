<script lang="ts">
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import StatusBadge from '$lib/components/app/status-badge.svelte';
	import PageHeader from '$lib/components/app/page-header.svelte';
	import ErrorState from '$lib/components/app/error-state.svelte';
	import DetailSkeleton from '$lib/components/app/detail-skeleton.svelte';
	import CommentTimeline from '$lib/components/app/comment-timeline.svelte';
	import CommentForm from '$lib/components/app/comment-form.svelte';
	import AttachmentCard from '$lib/components/app/attachment-card.svelte';
	import { commentService, grievanceService } from '$lib/services';
	import { getSession } from '$lib/stores/auth.svelte';
	import { GRIEVANCE_STATUSES, type Grievance, type GrievanceStatus } from '$lib/types';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import CopyIcon from '@lucide/svelte/icons/copy';

	const grievanceId = $derived(page.params.id ?? '');

	let grievance = $state<Grievance | null>(null);
	let loading = $state(true);
	let notFound = $state(false);
	let commenting = $state(false);
	let changingStatus = $state(false);

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString('en-IN', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function handlePrint() {
		window.print();
	}

	async function handleCopyId() {
		if (!grievance) return;
		try {
			await navigator.clipboard.writeText(grievance.id);
			toast.success(`Copied "${grievance.id}" to clipboard.`);
		} catch {
			toast.error('Could not copy ID.');
		}
	}

	async function load() {
		loading = true;
		notFound = false;
		const result = await grievanceService.getById(grievanceId);
		if (result.ok) {
			grievance = result.data;
		} else {
			grievance = null;
			notFound = true;
		}
		loading = false;
	}

	$effect(() => {
		if (grievanceId) load();
	});

	async function handleAddComment(body: string): Promise<boolean> {
		const uid = getSession()?.id;
		if (!uid || !grievance) return false;
		commenting = true;
		const result = await commentService.add(grievance.id, uid, body);
		commenting = false;
		if (result.ok) {
			grievance = { ...grievance, comments: [...grievance.comments, result.data] };
			return true;
		}
		return false;
	}

	async function handleStatusChange(next: string) {
		if (!grievance || next === grievance.status) return;
		changingStatus = true;
		const result = await grievanceService.updateStatus(grievance.id, next as GrievanceStatus);
		changingStatus = false;
		if (result.ok) {
			grievance = result.data;
			toast.success(`Status updated to "${result.data.status}".`);
		} else {
			toast.error('Could not update the status.', { description: result.error });
		}
	}
</script>

<svelte:head><title>Grievance {grievanceId} · HostelGrievance</title></svelte:head>

<div class="mb-4 flex items-center justify-between">
	<Button variant="ghost" size="sm" href="/warden/grievances">
		<ArrowLeftIcon class="size-4" />
		Back to all grievances
	</Button>
	{#if grievance}
		<Button variant="outline" size="sm" onclick={handlePrint} class="print:hidden">
			<PrinterIcon class="size-4" />
			<span>Print Record</span>
		</Button>
	{/if}
</div>

{#if loading}
	<DetailSkeleton />
{:else if notFound}
	<ErrorState
		title="Grievance not found"
		message="This grievance does not exist or may have been removed."
	/>
	<div class="mt-4">
		<Button variant="outline" href="/warden/grievances">Return to list</Button>
	</div>
{:else if grievance}
	{@const g = grievance}
	<PageHeader title={g.title}>
		{#snippet actions()}
			<div class="flex items-center gap-2">
				<span class="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hidden items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium sm:inline-flex">
					<ShieldCheckIcon class="size-3" />
					<span>Official University Redressal Record</span>
				</span>
				<StatusBadge status={g.status} />
			</div>
		{/snippet}
	</PageHeader>

	<div class="grid gap-6 lg:grid-cols-3">
		<div class="space-y-6 lg:col-span-2">
			<Card>
				<CardHeader>
					<CardTitle>Grievance</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
						<div>
							<dt class="text-muted-foreground text-xs">Grievance ID</dt>
							<dd class="flex items-center gap-1.5 font-mono text-xs">
								<span>{g.id}</span>
								<Button
									variant="ghost"
									size="sm"
									class="size-6 p-0"
									onclick={handleCopyId}
									title="Copy Reference ID"
								>
									<CopyIcon class="size-3 text-muted-foreground" />
									<span class="sr-only">Copy Reference ID</span>
								</Button>
							</dd>
						</div>
						<div>
							<dt class="text-muted-foreground text-xs">Student</dt>
							<dd>
								{g.student.name}
								<span class="text-muted-foreground block text-xs">{g.student.room ?? '—'}</span>
							</dd>
						</div>
						<div>
							<dt class="text-muted-foreground text-xs">Category</dt>
							<dd>{g.category}</dd>
						</div>
						<div>
							<dt class="text-muted-foreground text-xs">Filed on</dt>
							<dd>{formatDate(g.createdAt)}</dd>
						</div>
						<div>
							<dt class="text-muted-foreground text-xs">Last updated</dt>
							<dd>{formatDate(g.updatedAt)}</dd>
						</div>
					</dl>
					<Separator />
					<div>
						<h2 class="mb-1 text-sm font-medium">Description</h2>
						<p class="text-sm whitespace-pre-line">{g.description}</p>
					</div>
					{#if g.attachments.length > 0}
						<div>
							<h2 class="mb-2 text-sm font-medium">Attachments</h2>
							<div class="grid gap-2 sm:grid-cols-2">
								{#each g.attachments as att (att.id)}
									<AttachmentCard attachment={att} />
								{/each}
							</div>
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Comments</CardTitle>
				</CardHeader>
				<CardContent class="space-y-5">
					<CommentTimeline comments={g.comments} />
					<Separator />
					<CommentForm onSubmit={handleAddComment} submitting={commenting} />
				</CardContent>
			</Card>
		</div>

		<div class="space-y-4">
			<!-- Resolution Lifecycle Stepper -->
			<Card class="py-4">
				<CardContent class="px-4">
					<h2 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
						Redressal Lifecycle
					</h2>
					<div class="flex items-center justify-between">
						<div class="flex flex-col items-center">
							<div
								class="size-7 rounded-full flex items-center justify-center text-xs font-bold {g.status === 'Open' || g.status === 'In Progress' || g.status === 'Resolved' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}"
							>
								1
							</div>
							<span class="text-xs mt-1 font-medium">Filed</span>
						</div>
						<div
							class="h-0.5 flex-1 mx-2 {g.status === 'In Progress' || g.status === 'Resolved' ? 'bg-primary' : 'bg-muted'}"
						></div>
						<div class="flex flex-col items-center">
							<div
								class="size-7 rounded-full flex items-center justify-center text-xs font-bold {g.status === 'In Progress' || g.status === 'Resolved' ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground'}"
							>
								2
							</div>
							<span class="text-xs mt-1 font-medium">Under Action</span>
						</div>
						<div class="h-0.5 flex-1 mx-2 {g.status === 'Resolved' ? 'bg-emerald-500' : 'bg-muted'}"></div>
						<div class="flex flex-col items-center">
							<div
								class="size-7 rounded-full flex items-center justify-center text-xs font-bold {g.status === 'Resolved' ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}"
							>
								3
							</div>
							<span class="text-xs mt-1 font-medium">Resolved</span>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card class="py-4">
				<CardContent class="space-y-3 px-4">
					<h2 class="text-sm font-medium">Change status</h2>
					<Select.Root
						type="single"
						value={g.status}
						onValueChange={handleStatusChange}
						disabled={changingStatus}
					>
						<Select.Trigger class="w-full" aria-label="Change grievance status">
							{g.status}
						</Select.Trigger>
						<Select.Content>
							{#each GRIEVANCE_STATUSES as s (s)}
								<Select.Item value={s} label={s}>{s}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<p class="text-muted-foreground text-xs">
						The student sees the status change immediately in their view.
					</p>
				</CardContent>
			</Card>
		</div>
	</div>
{/if}
