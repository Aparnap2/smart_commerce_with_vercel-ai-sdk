-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "billingAddress" TEXT,
ADD COLUMN     "paymentMethod" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentStatus" TEXT,
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "shippingAddress" TEXT,
ADD COLUMN     "trackingNumber" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "category" TEXT,
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "sku" TEXT;

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "priority" TEXT,
ADD COLUMN     "relatedOrderId" INTEGER,
ADD COLUMN     "resolution" TEXT;
