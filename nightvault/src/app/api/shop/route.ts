import { currentUser } from '@/lib/auth';
import { fail, handle, json } from '@/lib/api';
import { db } from '@/lib/db';
import { move } from '@/lib/economy/wallet';

export async function GET() {
  return handle(async () => {
    const user = await currentUser();
    const items = await db.shopItem.findMany({ where: { enabled: true }, orderBy: { price: 'asc' } });
    const owned = user ? await db.inventoryItem.findMany({ where: { userId: user.id } }) : [];
    return json({
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        kind: item.kind,
        price: item.price,
        rarity: item.rarity,
        data: JSON.parse(item.dataJson || '{}'),
        owned: owned.some((entry) => entry.itemId === item.id),
        equipped: owned.some((entry) => entry.itemId === item.id && entry.equipped),
      })),
    });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return fail('Connecte-toi.', 401);
    const body = await request.json().catch(() => ({}));
    const item = await db.shopItem.findUnique({ where: { id: String(body.itemId ?? '') } });
    if (!item) return fail('Objet inconnu.', 404);

    const existing = await db.inventoryItem.findUnique({ where: { userId_itemId: { userId: user.id, itemId: item.id } } });

    if (body.action === 'equip') {
      if (!existing) return fail('Tu ne possèdes pas cet objet.');
      await db.$transaction([
        db.inventoryItem.updateMany({ where: { userId: user.id, item: { kind: item.kind } }, data: { equipped: false } }),
        db.inventoryItem.update({ where: { id: existing.id }, data: { equipped: true } }),
      ]);
      return json({ ok: true });
    }

    if (existing) return fail('Tu possèdes déjà cet objet.');
    const balance = await db.$transaction(async (tx) => {
      const next = await move(tx, user.id, BigInt(-item.price), 'SHOP', item.id);
      await tx.inventoryItem.create({ data: { userId: user.id, itemId: item.id } });
      return next;
    });
    return json({ ok: true, balance });
  });
}
