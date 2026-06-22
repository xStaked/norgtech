import { OrderReviewList } from "@/components/orders/order-review-list";

export default function OrderReviewPage() {
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Pedidos en revisión</h1>
      <OrderReviewList />
    </div>
  );
}
