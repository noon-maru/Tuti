"use client";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "@/features/tuti/hooks/useSession";
import { AppLoadingScreen } from "@/features/tuti/components/LoadingIndicator";
import { fetchLibraryHarumadis, libraryHarumadiPath } from "@/lib/harumadiPdfLibrary";
import { HarumadiPdfArchiveScreen } from "../screens/library/HarumadiPdfArchiveScreen";

export function HarumadiPdfArchiveFlow() {
  const session = useSession();
  return session ? <Archive key={session.userId} owner={session.userId} /> : <AppLoadingScreen />;
}
function Archive({ owner }: { owner: string }) {
  const router = useRouter();
  const query = useInfiniteQuery({ queryKey: ["library-exports", owner], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchLibraryHarumadis(owner, pageParam), getNextPageParam: page => page.nextCursor ?? undefined, retry: false });
  const harumadiPdfs = query.data?.pages.flatMap(page => page.harumadiPdfs) ?? [];
  return <HarumadiPdfArchiveScreen ownerId={owner} files={harumadiPdfs} pending={query.isPending}
    error={query.isError} busy={query.isFetching} hasNextPage={Boolean(query.hasNextPage)}
    onBack={() => router.replace("/")} onOpen={id => router.push(`${libraryHarumadiPath(id)}&from=pdfs`)}
    onRetry={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())}
    onLoadMore={() => void query.fetchNextPage()} />;
}
