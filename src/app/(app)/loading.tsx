import { PageContainer } from "@/components/shell/page";
import { LoadingRegion, Skeleton, SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageContainer>
      <LoadingRegion label="Loading page">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonTable />
        </div>
      </LoadingRegion>
    </PageContainer>
  );
}
