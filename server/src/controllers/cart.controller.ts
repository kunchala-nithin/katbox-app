import { Request, Response } from 'express';
import Cart from '../models/Cart';

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

    if (serviceType === 'homemade' || serviceType === 'mealbox') {
      const { chefId, chefName, items, totalItems, totalPrice, menu, selections, addons, orderDetails, userPhone, alternatePhone } = req.body;
      
      // Calculate dynamic discount metrics safely
      const appliedDiscount = Number(discount || 0);
      const calculatedFinalTotal = Math.max(0, Number(totalPrice || 0) - appliedDiscount);

      const resolvedUserPhone = userPhone || orderDetails?.contactPhone || (req as any).user?.phone || '';
      const resolvedAltPhone = alternatePhone || orderDetails?.alternatePhone || '';

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
        status: 'in-cart',
        couponCode: couponCode || null,
        discount: appliedDiscount,
        totalPriceAfterDiscount: calculatedFinalTotal
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

    // ✅ DYNAMIC COMPILATION OF ADDONS CALCULATED ACCORDING TO USER CONFIG: (Addon Price * Addon Selected Qty) * Selected Guest Count
    const addonsTotal = (addons || []).reduce((sum: number, currentAddon: any) => {
      const addonPrice = Number(currentAddon.price || 0);
      const addonCount = Number(currentAddon.count || 0);
      return sum + (addonPrice * addonCount * guests);
    }, 0);

    // ✅ TOTAL PRICE MATCHES EXACT MATHEMATICAL MODEL: (Plate Price * Guests) + (Addon Plate Matrix * Guests) + Delivery Charges
    const totalPrice = basePlatterTotal + addonsTotal + Number(deliveryPrice || 0);

    const appliedDiscount = Number(discount || 0);
    const calculatedFinalTotal = Math.max(0, totalPrice - appliedDiscount);

    const resolvedUserPhone = userPhone || orderDetails?.contactPhone || (req as any).user?.phone || '';
    const resolvedAltPhone = alternatePhone || orderDetails?.alternatePhone || '';

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
      addons: addons || [], // ✅ SAVE DYNAMIC ITEMS TO MONGO BLOCK RECORD INSTANCE DIRECTLY
      orderDetails,

      specialInstructions: {
        spice: orderDetails?.selectedSpice || "",
        noOnionsGarlic: !!orderDetails?.noOnionsGarlic,
        notes: orderDetails?.notes || "",
      },

      totalItems,
      totalPrice,

      // ✅🔥 STORE EXTRA ITEMS
      extraItems: extraItems || 0,

      type: type || "veg",
      serviceType: 'catering',
      couponCode: couponCode || null,
      discount: appliedDiscount,
      totalPriceAfterDiscount: calculatedFinalTotal
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

    if (serviceType === 'homemade' || serviceType === 'mealbox') {
      const { chefId, chefName, items, totalItems, totalPrice, menu, selections, addons, orderDetails, userPhone, alternatePhone } = req.body;
      const appliedDiscount = Number(discount || 0);
      const calculatedFinalTotal = Math.max(0, Number(totalPrice || 0) - appliedDiscount);

      const resolvedUserPhone = userPhone || orderDetails?.contactPhone || '';
      const resolvedAltPhone = alternatePhone || orderDetails?.alternatePhone || '';

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
          couponCode: couponCode || null,
          discount: appliedDiscount,
          totalPriceAfterDiscount: calculatedFinalTotal
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
      addons, // ✅ DESTRUCTURED FOR MULTI-VENDOR TRACKING SEQUENCING ARCHITECTURE
      orderItemDetails,
      orderDetails,
      type,
      finalPrice,
      deliveryPrice,
      extraItems, // ✅ NEW
      userPhone,
      alternatePhone
    } = req.body;

    const guests = Number(orderDetails?.guests || 0);

    // ✅ RECOMPUTE IN STRICT ORDER MATCHING ADD INTERPOLATION LAYOUT LAWS
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

    const updated = await Cart.findByIdAndUpdate(
      cartId,
      {
        menu,
        restaurant,
        userPhone: resolvedUserPhone,
        alternatePhone: resolvedAltPhone,
        selections,
        addons: addons || [], // ✅ SYNC MODIFIED METRIC ADDONS RECORD BLOCKS
        orderDetails,

        specialInstructions: {
          spice: orderDetails?.selectedSpice || '',
          noOnionsGarlic: !!orderDetails?.noOnionsGarlic,
          notes: orderDetails?.notes || '',
        },

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

        // ✅🔥 UPDATE EXTRA ITEMS
        extraItems: extraItems || 0,

        type: type || 'veg',
        couponCode: couponCode || null,
        discount: appliedDiscount,
        totalPriceAfterDiscount: calculatedFinalTotal
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