import { Request, Response } from 'express';
import Cart from '../models/Cart';

/* ─────────────────────────────────────────────────────────────────
   ✅ HELPER — Normalize the incoming special-instruction payload
   into a consistent { tag, label, text } shape.

   Accepts any of these input shapes:
     • req.body.specialInstruction = { tag, label, text }
     • req.body.orderDetails.specialInstruction = { tag, label, text }
     • req.body.orderDetails.instructionTag + selectedSpice + notes
     • req.body.specialInstructionTag + specialInstructionLabel + specialInstructionText

   Always returns an object with all three string fields (may be "").
   ───────────────────────────────────────────────────────────────── */
const resolveSpecialInstruction = (body: any) => {
  const od = body?.orderDetails || {};
  const direct = body?.specialInstruction || od?.specialInstruction || {};

  const tag = String(
    direct.tag ??
    body.specialInstructionTag ??
    od.instructionTag ??
    od.selectedSpice ??
    ""
  ).trim();

  const label = String(
    direct.label ??
    body.specialInstructionLabel ??
    od.specialInstructionLabel ??
    ""
  ).trim();

  const text = String(
    direct.text ??
    body.specialInstructionText ??
    od.specialInstructionText ??
    od.chefNotes ??
    od.notes ??
    ""
  ).trim();

  return { tag, label, text };
};

export const addToCart = async (req: Request, res: Response) => {
  try {
    const userId =
      (req as any).user?.userId ||
      (req as any).user?.id ||
      (req as any).user?._id;

    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    // ✅ Look for explicit serviceType mapping from payload
    const { serviceType, couponCode, discount } = req.body;

    // ✅ ITEM-BASED FLOWS: homemade, mealbox and quickbites all share the same
    // item-list-based cart structure. QuickBites is a sibling of homemade and
    // must persist the same delivery timestamps + slot fields.
    const isItemBasedFlow =
      serviceType === 'homemade' ||
      serviceType === 'mealbox' ||
      serviceType === 'quickbites';

    if (isItemBasedFlow) {
      const { chefId, chefName, items, totalItems, totalPrice, menu, selections, addons, orderDetails, userPhone, alternatePhone } = req.body;
      
      // Calculate dynamic discount metrics safely
      const appliedDiscount = Number(discount || 0);
      const calculatedFinalTotal = Math.max(0, Number(totalPrice || 0) - appliedDiscount);

      const resolvedUserPhone = userPhone || orderDetails?.contactPhone || (req as any).user?.phone || '';
      const resolvedAltPhone = alternatePhone || orderDetails?.alternatePhone || '';

      // ✅ Homemade / QuickBites-only: resolve delivery date & slot from top-level body OR nested orderDetails
      const resolvedDeliveryDate = String(
        req.body.deliveryDate ||
        orderDetails?.deliveryDate ||
        orderDetails?.deliveryDateKey ||
        ''
      );
      const resolvedDeliverySlot = String(
        req.body.deliverySlot ||
        orderDetails?.deliverySlot ||
        orderDetails?.deliveryTimeSlot ||
        ''
      );

      // ✅ NEW: Resolve the absolute estimated delivery timestamp + window + QuickBites flag.
      const estimatedDeliveryAtMsRaw = req.body.estimatedDeliveryAtMs;
      const parsedEstimatedDeliveryAtMs = Number(estimatedDeliveryAtMsRaw);
      const resolvedEstimatedDeliveryAt =
        Number.isFinite(parsedEstimatedDeliveryAtMs) && parsedEstimatedDeliveryAtMs > 0
          ? new Date(parsedEstimatedDeliveryAtMs)
          : undefined;
      const resolvedDeliveryWindowMinutes = Number(req.body.deliveryWindowMinutes) || 0;
      const resolvedIsQuickBites =
        String(req.body.isQuickBites || '').toLowerCase() === 'true' ||
        String(orderDetails?.isQuickBites || '').toLowerCase() === 'true' ||
        serviceType === 'quickbites';

      // ✅ Only homemade / quickbites flows carry the delivery date / slot /
      // estimatedDeliveryAt info. Mealbox carts keep these fields empty.
      const carriesDeliveryMeta =
        serviceType === 'homemade' || serviceType === 'quickbites';

      // ✅ NEW: Normalize the special-instruction payload for ALL item-based flows.
      const resolvedSpecialInstruction = resolveSpecialInstruction(req.body);

      // Clear out active current instances sitting in standard active workflow session
      await Cart.deleteMany({ user: userId, status: "in-cart" });

      const newHomemadeCart = new Cart({
        user: userId,
        userPhone: resolvedUserPhone,
        alternatePhone: resolvedAltPhone,
        serviceType,
        chefId,
        chefName,
        items: items || [],
        totalItems,
        totalPrice,
        menu,
        selections,
        addons,
        orderDetails,

        // ✅ NEW: Persist the special instruction object for homemade/quickbites/mealbox
        specialInstruction: resolvedSpecialInstruction,

        status: 'in-cart',
        couponCode: couponCode || null,
        discount: appliedDiscount,
        totalPriceAfterDiscount: calculatedFinalTotal,
        // ✅ Only meaningful for homemade / quickbites; harmless for mealbox (stays empty string)
        deliveryDate: carriesDeliveryMeta ? resolvedDeliveryDate : '',
        deliverySlot: carriesDeliveryMeta ? resolvedDeliverySlot : '',
        // ✅ NEW: Absolute timestamp for dynamic display in CartScreen
        estimatedDeliveryAt: carriesDeliveryMeta ? resolvedEstimatedDeliveryAt : undefined,
        deliveryWindowMinutes: carriesDeliveryMeta ? resolvedDeliveryWindowMinutes : 0,
        isQuickBites: carriesDeliveryMeta ? resolvedIsQuickBites : false
      });

      const savedHomemade = await newHomemadeCart.save();
      return res.status(201).json({
        success: true,
        cart: [savedHomemade],
      });
    }

    const {
      menu,
      restaurant,
      selections,
      addons, // ✅ DESTRUCTURED ADDONS PIPELINE VARIABLE
      totalItems,
      orderDetails,
      type,
      finalPrice,
      deliveryPrice,
      extraItems, // ✅ NEW
      userPhone,
      alternatePhone
    } = req.body;

    const guests = Number(orderDetails?.guests || 0);

    // ✅ CALCULATE BASE PRICE FROM CURRENT SELECTIONS PIPELINE
    const basePlatterTotal = Number(finalPrice || 0) * guests;

    // ✅ DYNAMIC COMPILATION OF ADDONS
    const addonsTotal = (addons || []).reduce((sum: number, currentAddon: any) => {
      const addonPrice = Number(currentAddon.price || 0);
      const addonCount = Number(currentAddon.count || 0);
      return sum + (addonPrice * addonCount * guests);
    }, 0);

    const totalPrice = basePlatterTotal + addonsTotal + Number(deliveryPrice || 0);

    const appliedDiscount = Number(discount || 0);
    const calculatedFinalTotal = Math.max(0, totalPrice - appliedDiscount);

    const resolvedUserPhone = userPhone || orderDetails?.contactPhone || (req as any).user?.phone || '';
    const resolvedAltPhone = alternatePhone || orderDetails?.alternatePhone || '';

    // ✅ NEW: Normalize the special-instruction payload for catering flow too.
    const resolvedSpecialInstruction = resolveSpecialInstruction(req.body);

    console.log("🔥 EXTRA ITEMS FROM FRONTEND:", extraItems);
    // ✅🔥 DELETE OLD CART (PREVENT DUPLICATES)
    await Cart.deleteMany({ user: userId, status: "in-cart" });
    const newCart = new Cart({
      user: userId,
      userPhone: resolvedUserPhone,
      alternatePhone: resolvedAltPhone,
      restaurant,
      menu,
      selections,
      addons: addons || [],
      orderDetails,

      specialInstructions: {
        spice: orderDetails?.selectedSpice || "",
        noOnionsGarlic: !!orderDetails?.noOnionsGarlic,
        notes: orderDetails?.notes || "",
      },

      // ✅ NEW: Persist the nested special-instruction object
      specialInstruction: resolvedSpecialInstruction,

      totalItems,
      totalPrice,

      // ✅🔥 STORE EXTRA ITEMS
      extraItems: extraItems || 0,

      type: type || "veg",
      serviceType: 'catering',
      couponCode: couponCode || null,
      discount: appliedDiscount,
      totalPriceAfterDiscount: calculatedFinalTotal,
      // ✅ Catering flow untouched — leave deliveryDate/Slot empty
      deliveryDate: '',
      deliverySlot: '',
      // ✅ NEW: Catering doesn't use the estimatedDeliveryAt timestamp
      estimatedDeliveryAt: undefined,
      deliveryWindowMinutes: 0,
      isQuickBites: false
    });

    const saved = await newCart.save();

    res.status(201).json({
      success: true,
      cart: [saved],
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getUserCart = async (req: Request, res: Response) => {
  try {
    const userId =
      (req as any).user?.userId ||
      (req as any).user?.id ||
      (req as any).user?._id;

    const cart = await Cart.find({
      user: userId,
      status: 'in-cart'
    }).sort({ createdAt: -1 });

    res.json({ success: true, cart });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateCart = async (req: Request, res: Response) => {
  try {
    const { cartId } = req.params;
    const { serviceType, couponCode, discount } = req.body;

    // ✅ ITEM-BASED FLOWS: homemade, mealbox and quickbites all share the
    // same item-list-based structure. QuickBites is a sibling of homemade.
    const isItemBasedFlow =
      serviceType === 'homemade' ||
      serviceType === 'mealbox' ||
      serviceType === 'quickbites';

    if (isItemBasedFlow) {
      const { chefId, chefName, items, totalItems, totalPrice, menu, selections, addons, orderDetails, userPhone, alternatePhone } = req.body;
      const appliedDiscount = Number(discount || 0);
      const calculatedFinalTotal = Math.max(0, Number(totalPrice || 0) - appliedDiscount);

      const resolvedUserPhone = userPhone || orderDetails?.contactPhone || '';
      const resolvedAltPhone = alternatePhone || orderDetails?.alternatePhone || '';

      const resolvedDeliveryDate = String(
        req.body.deliveryDate ||
        orderDetails?.deliveryDate ||
        orderDetails?.deliveryDateKey ||
        ''
      );
      const resolvedDeliverySlot = String(
        req.body.deliverySlot ||
        orderDetails?.deliverySlot ||
        orderDetails?.deliveryTimeSlot ||
        ''
      );

      const estimatedDeliveryAtMsRaw = req.body.estimatedDeliveryAtMs;
      const parsedEstimatedDeliveryAtMs = Number(estimatedDeliveryAtMsRaw);
      const resolvedEstimatedDeliveryAt =
        Number.isFinite(parsedEstimatedDeliveryAtMs) && parsedEstimatedDeliveryAtMs > 0
          ? new Date(parsedEstimatedDeliveryAtMs)
          : undefined;
      const resolvedDeliveryWindowMinutes = Number(req.body.deliveryWindowMinutes) || 0;
      const resolvedIsQuickBites =
        String(req.body.isQuickBites || '').toLowerCase() === 'true' ||
        String(orderDetails?.isQuickBites || '').toLowerCase() === 'true' ||
        serviceType === 'quickbites';

      const carriesDeliveryMeta =
        serviceType === 'homemade' || serviceType === 'quickbites';

      // ✅ NEW: Normalize special-instruction payload on update too.
      const resolvedSpecialInstruction = resolveSpecialInstruction(req.body);

      const updatedHomemade = await Cart.findByIdAndUpdate(
        cartId,
        { 
          chefId, 
          chefName, 
          userPhone: resolvedUserPhone,
          alternatePhone: resolvedAltPhone,
          items: items || [], 
          totalItems, 
          totalPrice, 
          menu, 
          selections, 
          addons, 
          orderDetails, 
          serviceType,

          // ✅ NEW: Persist nested special-instruction object
          specialInstruction: resolvedSpecialInstruction,

          couponCode: couponCode || null,
          discount: appliedDiscount,
          totalPriceAfterDiscount: calculatedFinalTotal,
          deliveryDate: carriesDeliveryMeta ? resolvedDeliveryDate : '',
          deliverySlot: carriesDeliveryMeta ? resolvedDeliverySlot : '',
          estimatedDeliveryAt: carriesDeliveryMeta ? resolvedEstimatedDeliveryAt : undefined,
          deliveryWindowMinutes: carriesDeliveryMeta ? resolvedDeliveryWindowMinutes : 0,
          isQuickBites: carriesDeliveryMeta ? resolvedIsQuickBites : false
        },
        { new: true }
      );
      return res.json({
        success: true,
        message: 'Cart updated',
        cart: updatedHomemade,
      });
    }

    const {
      menu,
      restaurant,
      selections,
      addons,
      orderItemDetails,
      orderDetails,
      type,
      finalPrice,
      deliveryPrice,
      extraItems,
      userPhone,
      alternatePhone
    } = req.body;

    const guests = Number(orderDetails?.guests || 0);

    const basePlatterTotal = Number(finalPrice || 0) * guests;
    const addonsTotal = (addons || []).reduce((sum: number, currentAddon: any) => {
      const addonPrice = Number(currentAddon.price || 0);
      const addonCount = Number(currentAddon.count || 0);
      return sum + (addonPrice * addonCount * guests);
    }, 0);

    const totalPrice = basePlatterTotal + addonsTotal + Number(deliveryPrice || 0);

    const appliedDiscount = Number(discount || 0);
    const calculatedFinalTotal = Math.max(0, totalPrice - appliedDiscount);

    const resolvedUserPhone = userPhone || orderDetails?.contactPhone || '';
    const resolvedAltPhone = alternatePhone || orderDetails?.alternatePhone || '';

    // ✅ NEW: Normalize special-instruction payload on update too.
    const resolvedSpecialInstruction = resolveSpecialInstruction(req.body);

    const updated = await Cart.findByIdAndUpdate(
      cartId,
      {
        menu,
        restaurant,
        userPhone: resolvedUserPhone,
        alternatePhone: resolvedAltPhone,
        selections,
        addons: addons || [],
        orderDetails,

        specialInstructions: {
          spice: orderDetails?.selectedSpice || '',
          noOnionsGarlic: !!orderDetails?.noOnionsGarlic,
          notes: orderDetails?.notes || '',
        },

        // ✅ NEW: Persist nested special-instruction object
        specialInstruction: resolvedSpecialInstruction,

        totalItems: selections?.reduce
          ? selections.reduce(
              (acc: number, cat: any) =>
                acc +
                (cat.selected?.length || 0) +
                (cat.extraSelected?.length || 0), 
              0
            )
          : 0,

        totalPrice,
        extraItems: extraItems || 0,
        type: type || 'veg',
        couponCode: couponCode || null,
        discount: appliedDiscount,
        totalPriceAfterDiscount: calculatedFinalTotal,
        deliveryDate: '',
        deliverySlot: '',
        estimatedDeliveryAt: undefined,
        deliveryWindowMinutes: 0,
        isQuickBites: false
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Cart updated',
      cart: updated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteCart = async (req: Request, res: Response) => {
  try {
    const { cartId } = req.params;

    await Cart.findByIdAndDelete(cartId);

    res.json({
      success: true,
      message: 'Cart permanently deleted',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};