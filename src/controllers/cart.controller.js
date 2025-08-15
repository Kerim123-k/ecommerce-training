const Product = require('../models/Product');

function getCart(req){
  if (!req.session.cart) req.session.cart = { items: [], itemCount: 0, subtotal: 0 };
  return req.session.cart;
}
function recalc(cart){
  cart.itemCount = cart.items.reduce((n,i)=>n+i.qty,0);
  cart.subtotal  = Number(cart.items.reduce((s,i)=>s+i.qty*i.unitPrice,0).toFixed(2));
}

exports.view = (req,res) => {
  const cart = getCart(req);
  res.render('cart/index', { cart });
};

exports.add = async (req,res,next) => {
  try {
    const { id } = req.params;
    const qty = Math.max(1, parseInt(req.body.qty || '1',10));
    const p = await Product.findById(id);
    if (!p || p.status !== 'Active') return res.status(404).send('Product not available');

    const cart = getCart(req);
    const existing = cart.items.find(i => String(i.productId) === String(p._id));
    if (existing) existing.qty += qty;
    else cart.items.push({
      productId: p._id, title: p.title, sku: p.sku, qty,
      unitPrice: p.price, image: (p.images && p.images[0]) || ''
    });
    recalc(cart);
    res.redirect('/cart');
  } catch (e) { next(e); }
};

exports.update = (req,res) => {
  const cart = getCart(req);
  // body: [{id, qty}] OR single fields id, qty
  const updates = Array.isArray(req.body.items) ? req.body.items : [{ id: req.body.id, qty: req.body.qty }];
  updates.forEach(u => {
    const it = cart.items.find(i => String(i.productId) === String(u.id));
    if (it) it.qty = Math.max(0, parseInt(u.qty,10) || 0);
  });
  cart.items = cart.items.filter(i => i.qty > 0);
  recalc(cart);
  res.redirect('/cart');
};

exports.clear = (req,res) => {
  req.session.cart = { items: [], itemCount: 0, subtotal: 0 };
  res.redirect('/cart');
};
