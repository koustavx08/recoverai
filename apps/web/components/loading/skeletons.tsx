import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function StatCardGridSkeleton({ count = 4 }: { readonly count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { readonly rows?: number }) {
  return (
    <Card>
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </Card>
  );
}

export function CardGridSkeleton({ count = 4 }: { readonly count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i}>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
