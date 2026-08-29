<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table/index.js';
	import StatusBadge from '$lib/components/app/status-badge.svelte';
	import PageHeader from '$lib/components/app/page-header.svelte';
	import EmptyState from '$lib/components/app/empty-state.svelte';
	import ErrorState from '$lib/components/app/error-state.svelte';
	import ListSkeleton from '$lib/components/app/list-skeleton.svelte';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { grievanceService } from '$lib/services';
	import type { Grievance } from '$lib/types';

	let grievances = $state<Grievance[]>([]);
	let searchQuery = $state('');
	let statusFilter = $state<'all' | 'Open' | 'In Progress' | 'Resolved'>('all');
	let loading = $state(true);
	let error = $state<string | null>(null);

	const filteredGrievances = $derived.by(() => {
		let list = grievances;
		if (statusFilter !== 'all') {
			list = list.filter((g) => g.status === statusFilter);
		}
		const q = searchQuery.trim().toLowerCase();
		if (!q) return list;
		return list.filter(
			(g) =>
				g.id.toLowerCase().includes(q) ||
				g.title.toLowerCase().includes(q) ||
				g.student.name.toLowerCase().includes(q) ||
				(g.student.room && g.student.room.toLowerCase().includes(q)) ||
				g.category.toLowerCase().includes(q) ||
				g.status.toLowerCase().includes(q)
		);
	});

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	async function load() {
		loading = true;
		error = null;
		const result = await grievanceService.listAll();
		if (result.ok) {
			grievances = result.data;
		} else {
			error = result.error;
		}
		loading = false;
	}

	load();
</script>

<svelte:head><title>All grievances · HostelGrievance</title></svelte:head>

<PageHeader title="All grievances" description="Grievances filed by students across the hostel." />

{#if loading}
	<ListSkeleton rows={6} />
{:else if error}
	<ErrorState message={error} onRetry={load} />
{:else if grievances.length === 0}
	<EmptyState title="No grievances" description="When students file grievances, they will show up here." />
{:else}
	<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<div class="relative w-full max-w-xs">
			<SearchIcon class="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
			<Input
				type="search"
				placeholder="Filter by title, student, room, or status…"
				class="pl-9"
				bind:value={searchQuery}
			/>
		</div>

		<div class="flex items-center gap-1.5 rounded-lg border bg-card p-1 text-xs">
			<Button
				variant={statusFilter === 'all' ? 'default' : 'ghost'}
				size="sm"
				class="h-7 px-2.5 text-xs"
				onclick={() => (statusFilter = 'all')}
			>
				All
			</Button>
			<Button
				variant={statusFilter === 'Open' ? 'default' : 'ghost'}
				size="sm"
				class="h-7 px-2.5 text-xs"
				onclick={() => (statusFilter = 'Open')}
			>
				Open
			</Button>
			<Button
				variant={statusFilter === 'In Progress' ? 'default' : 'ghost'}
				size="sm"
				class="h-7 px-2.5 text-xs"
				onclick={() => (statusFilter = 'In Progress')}
			>
				In Progress
			</Button>
			<Button
				variant={statusFilter === 'Resolved' ? 'default' : 'ghost'}
				size="sm"
				class="h-7 px-2.5 text-xs"
				onclick={() => (statusFilter = 'Resolved')}
			>
				Resolved
			</Button>
		</div>
	</div>

	<Card>
		<CardContent class="px-0">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>ID</TableHead>
						<TableHead>Student</TableHead>
						<TableHead>Title</TableHead>
						<TableHead>Category</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Created</TableHead>
						<TableHead>Updated</TableHead>
						<TableHead class="text-right"><span class="sr-only">Actions</span></TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each filteredGrievances as g (g.id)}
						<TableRow>
							<TableCell class="text-muted-foreground font-mono text-xs">{g.id}</TableCell>
							<TableCell class="whitespace-nowrap">
								<span class="font-medium">{g.student.name}</span>
								<span class="text-muted-foreground block text-xs">{g.student.room ?? '—'}</span>
							</TableCell>
							<TableCell class="max-w-64 truncate font-medium">
								<a href="/warden/grievances/{g.id}" class="hover:underline">{g.title}</a>
							</TableCell>
							<TableCell>{g.category}</TableCell>
							<TableCell><StatusBadge status={g.status} /></TableCell>
							<TableCell class="text-muted-foreground whitespace-nowrap">{formatDate(g.createdAt)}</TableCell>
							<TableCell class="text-muted-foreground whitespace-nowrap">{formatDate(g.updatedAt)}</TableCell>
							<TableCell class="text-right">
								<Button variant="outline" size="sm" href="/warden/grievances/{g.id}">Open</Button>
							</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</CardContent>
	</Card>
{/if}
