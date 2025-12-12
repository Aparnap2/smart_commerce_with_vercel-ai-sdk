import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting e-commerce database seeding...\n');

  // --- Customers with Payment Methods ---
  console.log('1️⃣ Seeding Customers with Payment Methods...');
  
  const alice = await prisma.customer.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      name: 'Alice Smith',
      phone: '123-456-7890',
      address: '123 Main St, Anytown USA',
      paymentMethod: 'VISA ****1234',
      billingAddress: '123 Main St, Anytown USA',
    },
  });

  const bob = await prisma.customer.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      name: 'Bob Johnson',
      phone: '987-654-3210',
      address: '456 Oak Ave, Otherville USA',
      paymentMethod: 'MASTERCARD ****5678',
      billingAddress: '456 Oak Ave, Otherville USA',
    },
  });

  const charlie = await prisma.customer.upsert({
    where: { email: 'charlie@sample.net' },
    update: {},
    create: {
      email: 'charlie@sample.net',
      name: 'Charlie Brown',
      phone: '555-123-4567',
      address: '789 Pine Ln, Somewhere USA',
      paymentMethod: 'AMEX ****9012',
      billingAddress: '789 Pine Ln, Somewhere USA',
    },
  });

  const diana = await prisma.customer.upsert({
    where: { email: 'diana@test.org' },
    update: {},
    create: {
      email: 'diana@test.org',
      name: 'Diana Prince',
      phone: '555-987-6543',
      address: '1 Wonder Way, Themyscira',
      paymentMethod: 'PAYPAL diana@test.org',
      billingAddress: '1 Wonder Way, Themyscira',
    },
  });

  console.log('✅ Seeded 4 customers with payment methods\n');

  // --- Products with Categories and Inventory ---
  console.log('2️⃣ Seeding Products...');
  
  const products = [
    {
      id: 101,
      name: 'Smartphone X',
      description: 'Latest generation smartphone with 5G, 128GB storage, and advanced camera system',
      price: 699.99,
      stock: 50,
      category: 'Electronics',
      image: '/smartphone.jpg',
      sku: 'ELEC-SMART-X',
      rating: 4.8,
    },
    {
      id: 102,
      name: 'Laptop Pro',
      description: 'High-performance laptop with 16GB RAM, 512GB SSD, and 14-inch Retina display',
      price: 1299.99,
      stock: 25,
      category: 'Electronics',
      image: '/laptop.jpg',
      sku: 'ELEC-LAPTOP-PRO',
      rating: 4.9,
    },
    {
      id: 103,
      name: 'Wireless Earbuds',
      description: 'Noise-cancelling wireless earbuds with 30-hour battery life',
      price: 149.99,
      stock: 100,
      category: 'Accessories',
      image: '/earbuds.jpg',
      sku: 'ACC-EARBUDS-WL',
      rating: 4.7,
    },
    {
      id: 104,
      name: 'USB-C Charger',
      description: 'Fast charging 65W wall adapter with USB-C port',
      price: 29.99,
      stock: 200,
      category: 'Accessories',
      image: null,
      sku: 'ACC-CHARGER-USBC',
      rating: 4.5,
    },
    {
      id: 105,
      name: 'Smart Watch Pro',
      description: 'Advanced smartwatch with heart rate monitor, GPS, and 7-day battery',
      price: 249.99,
      stock: 30,
      category: 'Wearables',
      image: '/smartwatch.jpg',
      sku: 'WEAR-SMART-PRO',
      rating: 4.6,
    },
    {
      id: 106,
      name: 'Bluetooth Speaker',
      description: 'Portable Bluetooth speaker with 20W output and waterproof design',
      price: 89.99,
      stock: 75,
      category: 'Audio',
      image: null,
      sku: 'AUDIO-BT-SPEAKER',
      rating: 4.4,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {},
      create: product,
    });
  }

  console.log('✅ Seeded 6 products with full details\n');

  // --- Orders with Order Items (Cart Simulation) ---
  console.log('3️⃣ Seeding Orders with Order Items...');
  
  // Alice's orders
  const aliceOrder1 = await prisma.order.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      customerId: alice.id,
      productId: 101, // Smartphone X
      total: 699.99,
      status: 'Delivered',
      orderDate: new Date('2025-05-05'),
      quantity: 1,
      paymentStatus: 'Paid',
      shippingAddress: alice.address,
      trackingNumber: 'UPX123456789',
    },
  });

  const aliceOrder2 = await prisma.order.upsert({
    where: { id: 3 },
    update: {},
    create: {
      id: 3,
      customerId: alice.id,
      productId: 103, // Wireless Earbuds
      total: 149.99,
      status: 'Delivered',
      orderDate: new Date('2025-05-10'),
      quantity: 1,
      paymentStatus: 'Paid',
      shippingAddress: alice.address,
      trackingNumber: 'FDX987654321',
    },
  });

  // Bob's order
  const bobOrder = await prisma.order.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      customerId: bob.id,
      productId: 102, // Laptop Pro
      total: 1299.99,
      status: 'Processing',
      orderDate: new Date('2025-05-15'),
      quantity: 1,
      paymentStatus: 'Pending',
      shippingAddress: bob.address,
      trackingNumber: null,
    },
  });

  // Charlie's order
  const charlieOrder = await prisma.order.upsert({
    where: { id: 4 },
    update: {},
    create: {
      id: 4,
      customerId: charlie.id,
      productId: 101, // Smartphone X
      total: 699.99,
      status: 'Shipped',
      orderDate: new Date('2025-05-18'),
      quantity: 1,
      paymentStatus: 'Paid',
      shippingAddress: charlie.address,
      trackingNumber: 'DHL555123456',
    },
  });

  // Diana's order
  const dianaOrder = await prisma.order.upsert({
    where: { id: 5 },
    update: {},
    create: {
      id: 5,
      customerId: diana.id,
      productId: 104, // USB-C Charger
      total: 29.99,
      status: 'Delivered',
      orderDate: new Date('2025-05-20'),
      quantity: 2,
      paymentStatus: 'Paid',
      shippingAddress: diana.address,
      trackingNumber: 'USP789456123',
    },
  });

  console.log('✅ Seeded 5 orders with full e-commerce details\n');

  // --- Support Tickets ---
  console.log('4️⃣ Seeding Support Tickets...');
  
  const tickets = [
    {
      id: 1,
      customerId: bob.id,
      issue: 'Laptop screen flickering after latest software update.',
      status: 'Open',
      createdAt: new Date('2025-05-16'),
      priority: 'High',
      relatedOrderId: 2,
    },
    {
      id: 2,
      customerId: alice.id,
      issue: 'Received wrong item in order #3. Expected Wireless Earbuds but got USB-C Charger.',
      status: 'Resolved',
      createdAt: new Date('2025-05-12'),
      priority: 'Medium',
      relatedOrderId: 3,
      resolution: 'Replacement sent on 2025-05-14',
    },
    {
      id: 3,
      customerId: diana.id,
      issue: 'Cannot connect wireless earbuds to smartphone. Bluetooth pairing fails.',
      status: 'In Progress',
      createdAt: new Date('2025-05-21'),
      priority: 'Medium',
      relatedOrderId: null,
    },
    {
      id: 4,
      customerId: charlie.id,
      issue: 'Inquiry about return policy for order #4. Want to return Smartphone X.',
      status: 'Open',
      createdAt: new Date('2025-05-19'),
      priority: 'Low',
      relatedOrderId: 4,
    },
  ];

  for (const ticket of tickets) {
    await prisma.supportTicket.upsert({
      where: { id: ticket.id },
      update: {},
      create: ticket,
    });
  }

  console.log('✅ Seeded 4 support tickets with full details\n');

  // --- Cart Simulation (Pending Orders) ---
  console.log('5️⃣ Seeding Cart Items (Pending Orders)...');
  
  const cartItems = [
    {
      id: 10,
      customerId: alice.id,
      productId: 105, // Smart Watch Pro
      total: 249.99,
      status: 'Cart',
      orderDate: new Date(),
      quantity: 1,
      paymentStatus: 'Pending',
    },
    {
      id: 11,
      customerId: bob.id,
      productId: 106, // Bluetooth Speaker
      total: 89.99,
      status: 'Cart',
      orderDate: new Date(),
      quantity: 2,
      paymentStatus: 'Pending',
    },
  ];

  for (const cartItem of cartItems) {
    await prisma.order.upsert({
      where: { id: cartItem.id },
      update: {},
      create: cartItem,
    });
  }

  console.log('✅ Seeded 2 cart items for demo purposes\n');

  console.log('🌱 E-commerce database seeding completed successfully!');
  console.log('\n📊 Seeding Summary:');
  console.log('  ✅ 4 Customers with payment methods');
  console.log('  ✅ 6 Products with full e-commerce details');
  console.log('  ✅ 5 Completed Orders with tracking');
  console.log('  ✅ 2 Cart Items (pending orders)');
  console.log('  ✅ 4 Support Tickets with priorities');
  console.log('\n🎯 Ready for e-commerce chatbot testing!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });