// ustatop-bot/index.js
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ADMIN_ID = 7695822564;

// Yordamchi funksiyalar
async function getUser(telegramId) {
  const { data } = await supabase.from('users').select('*').eq('telegram_id', telegramId).maybeSingle();
  return data;
}

const getRoleName = (role) => {
  const roles = { 'customer': 'Mijoz', 'worker': 'Usta', 'seller': 'Do\'kon', 'admin': 'Admin' };
  return roles[role] || role;
};

const getMainMenu = (telegramId) => {
  const menu = [
    ['👤 Profilim', '🔑 Mening Parolim'],
    ['⚙️ Parolni o\'zgartirish', '💎 Premium'],
    ['📞 Yordam']
  ];
  if (telegramId === ADMIN_ID) menu.push(['🛠 Admin Panel']);
  return Markup.keyboard(menu).resize();
};

// 1. /start
bot.start(async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user && user.phone) {
    return ctx.reply(`Assalomu alaykum, ${user.name}! 👋\nRolingiz: ${getRoleName(user.role)}`, getMainMenu(ctx.from.id));
  }
  ctx.reply(`Assalomu alaykum! Tizimga kirish uchun telefon raqamingizni yuboring:`, 
    Markup.keyboard([[Markup.button.contactRequest('📱 Telefon raqamni yuborish')]]).resize());
});

// 2. Telefon raqam va avtomatik PIN berish
bot.on('contact', async (ctx) => {
  const phone = ctx.message.contact.phone_number;
  const telegramId = ctx.from.id;
  const name = ctx.from.first_name;

  let user = await getUser(telegramId);
  if (!user) {
    // Yangi foydalanuvchi uchun avtomatik 6 xonali parol yaratamiz
    const initialPin = Math.floor(100000 + Math.random() * 900000).toString();
    const initialToken = crypto.randomBytes(16).toString('hex');
    
    await supabase.from('users').insert([{ 
      telegram_id: telegramId, 
      name, 
      phone, 
      role: 'customer',
      auth_pin: initialPin, 
      auth_token: initialToken
    }]);
    
    ctx.reply(
      `Rahmat! Tizimga muvaffaqiyatli qo'shildingiz. 🙋‍♂️\n\n` +
      `🔐 <b>Sizning doimiy kirish parolingiz:</b> <code>${initialPin}</code>\n\n` +
      `Bu parolni hech kimga bermang. Xohlasangiz, keyinchalik bot menyusidagi "⚙️ Parolni o'zgartirish" orqali almashtirishingiz mumkin.`,
      { parse_mode: 'HTML', reply_markup: getMainMenu(ctx.from.id).reply_markup }
    );
  } else {
    await supabase.from('users').update({ phone }).eq('telegram_id', telegramId);
    ctx.reply(`Rahmat! Telefon raqamingiz yangilandi.`, getMainMenu(ctx.from.id));
  }
});

// 3. Mening Parolim
bot.hears('🔑 Mening Parolim', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user && user.auth_pin) {
    ctx.reply(`🔐 <b>Sizning doimiy kirish parolingiz:</b> <code>${user.auth_pin}</code>\n\n<i>Uni hech kimga bermang!</i>`, { parse_mode: 'HTML' });
  } else {
    ctx.reply('Sizda hali parol yo\'q. Iltimos, /start buyrug\'ini qayta bering.');
  }
});

// 4. Parolni o'zgartirish
bot.hears('⚙️ Parolni o\'zgartirish', async (ctx) => {
  ctx.reply(`Yangi 6 xonali parolni quyidagicha yuboring:\n\n<code>/parol 123456</code>\n\n<i>(123456 o'rniga o'zingizning yangi parolingizni yozing)</i>`, { parse_mode: 'HTML' });
});

bot.command('parol', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply('Avval /start buyrug\'ini bering.');

  const newPin = ctx.message.text.split(' ')[1];
  if (!newPin || newPin.length !== 6 || isNaN(newPin)) {
    return ctx.reply('❌ Xato! Iltimos, faqat 6 xonali raqam kiriting. Masalan: /parol 123456');
  }

  await supabase.from('users').update({ auth_pin: newPin }).eq('id', user.id);
  ctx.reply(`✅ Parolingiz muvaffaqiyatli o'zgartirildi!\n\nYangi parolingiz: <code>${newPin}</code>`, { parse_mode: 'HTML' });
});

// 5. Profil
bot.hears('👤 Profilim', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user) {
    const isPremium = user.premium_until && new Date(user.premium_until) > new Date();
    ctx.reply(`<b>👤 Profilingiz:</b>\nIsm: ${user.name}\nRol: ${getRoleName(user.role)}\nHolat: ${user.is_verified ? '✅ Tasdiqlangan' : '⏳ Tasdiqlanmagan'}\nBalans: ${(user.wallet_balance || 0).toLocaleString()} so'm\nBonus: ${(user.bonus_balance || 0).toLocaleString()} so'm\nPremium: ${isPremium ? user.premium_tier.toUpperCase() : "Yo'q"}`, { parse_mode: 'HTML' });
  }
});

// 6. Yordam
bot.hears('📞 Yordam', async (ctx) => {
  ctx.reply(`<b>🛠 Yordam Markazi</b>\n\n📞 Telefon: +998 88 982 22 27\n✈️ Telegram: @ustatoping`, { parse_mode: 'HTML' });
});

// 7. Rolni o'zgartirish (Tasdiqlash bilan)
bot.hears('🔄 Rolni o\'zgartirish', async (ctx) => {
  ctx.reply(`Qaysi rolga o'tmoqchisiz? (Faol buyurtmalaringiz bo'lsa, rol o'zgarmaydi)`, Markup.inlineKeyboard([
    [Markup.button.callback('🙋 Mijoz', 'role_customer')],
    [Markup.button.callback('👷 Usta', 'role_worker')],
    [Markup.button.callback('🏪 Do\'kon', 'role_seller')]
  ]));
});

bot.action(/role_(.+)/, async (ctx) => {
  const newRole = ctx.match[1];
  const telegramId = ctx.from.id;
  const currentUser = await getUser(telegramId);

  if (currentUser.role === newRole) return ctx.answerCbQuery('Siz allaqachon bu roldasiz.', { show_alert: true });

  // Faol buyurtmalarni tekshirish
  const { count: activeOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .in('status', ['new', 'accepted'])
    .or(`worker_id.eq.${currentUser.id},shop_id.eq.${currentUser.id}`);

  if (activeOrders > 0) {
    return ctx.editMessageText(`⚠️ <b>Rolni o'zgartirish mumkin emas!</b>\n\nSizda <b>${activeOrders} ta</b> faol buyurtma bor. Avval ularni yakunlang.`, { parse_mode: 'HTML' });
  }

  await supabase.from('users').update({ 
    role: newRole,
    verification_status: newRole === 'customer' ? 'approved' : 'pending'
  }).eq('id', currentUser.id);

  ctx.editMessageText(`✅ Rolingiz <b>${getRoleName(newRole)}</b> ga o'zgartirildi.\n\nParolingiz o'zgarmadi, o'sha parol bilan saytga kirishingiz mumkin.`, { parse_mode: 'HTML' });
  ctx.reply(`Asosiy menyu:`, getMainMenu(telegramId));
});

// 8. Admin Panel va Premium (oldingi kodlaringiz o'zgarmaydi)
bot.hears('🛠 Admin Panel', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  let user = await getUser(ctx.from.id);
  if (!user) {
    const initialPin = Math.floor(100000 + Math.random() * 900000).toString();
    await supabase.from('users').insert([{ telegram_id: ctx.from.id, name: 'Bosh Admin', role: 'admin', phone: '+998900000000', auth_pin: initialPin }]);
    return ctx.reply(`Admin parolingiz: <code>${initialPin}</code>`, { parse_mode: 'HTML' });
  }
  ctx.reply(`Xush kelibsiz, Admin! Parolingiz: <code>${user.auth_pin}</code>`, { parse_mode: 'HTML' });
});

bot.hears('💎 Premium', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return;
  // Premium kodlaringiz shu yerda qoladi...
  ctx.reply('Premium bo\'limi tez orada ishga tushadi.');
});

// ==========================================
// ✅ SUPABASE REALTIME: YANGI XABARLARNI TELEGRAMGA YUBORISH
// ==========================================
console.log("🔔 Realtime xabarnomalar kuzatilmoqda...");

supabase
  .channel('custom-all-channel')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'notifications' },
    async (payload) => {
      const notif = payload.new;
      
      // Bazadan foydalanuvchining telegram_id sini olamiz
      const { data: user, error } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('id', notif.user_id)
        .single();

      // Agar foydalanuvchida telegram_id bo'lsa, xabar yuboramiz
      if (user && user.telegram_id) {
        try {
          let icon = '🔔';
          if (notif.type === 'order') icon = '📋';
          if (notif.type === 'message') icon = '💬';

          await bot.telegram.sendMessage(
            user.telegram_id,
            `${icon} <b>${notif.title}</b>\n\n${notif.message}`,
            { parse_mode: 'HTML' }
          );
          console.log(`✅ Xabar yuborildi: ${user.telegram_id}`);
        } catch (err) {
          console.error(`❌ Xabar yuborishda xatolik (${user.telegram_id}):`, err.message);
        }
      }
    }
  )
  .subscribe();

// ISHGA TUSHIRISH
bot.launch().then(() => console.log('🤖 Bot ishga tushdi!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));