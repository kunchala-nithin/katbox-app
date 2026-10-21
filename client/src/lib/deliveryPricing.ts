/**
 * KatBox distance-based delivery pricing.
 *
 * Customer coordinates are latitude/longitude.
 * Chef GeoJSON coordinates are stored as [longitude, latitude].
 *
 * Pricing rule:
 *   - 0–5 km: ₹40
 *   - Above 5 km: ₹40 + ₹10 for every additional kilometre or part thereof.
 *
 * This client-side quote is for displaying the estimate. The backend recalculates
 * and persists the authoritative distance and fee when the order is created.
 */

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type DeliveryQuote = {
  distanceKm: number;
  distanceDeliveryFee: number;
};

export const isValidDeliveryCoordinates = (
  latitude: unknown,
  longitude: unknown
): boolean => {
  const lat = Number(latitude);
  const lng = Number(longitude);

  return (
    latitude !== null &&
    latitude !== undefined &&
    longitude !== null &&
    longitude !== undefined &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
};

export const calculateHaversineDistanceKm = (
  customer: Coordinates,
  chef: Coordinates
): number => {
  if (
    !isValidDeliveryCoordinates(customer.latitude, customer.longitude) ||
    !isValidDeliveryCoordinates(chef.latitude, chef.longitude)
  ) {
    throw new Error("A valid customer and chef map location are required.");
  }

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(chef.latitude - customer.latitude);
  const dLon = toRadians(chef.longitude - customer.longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(customer.latitude)) *
      Math.cos(toRadians(chef.latitude)) *
      Math.sin(dLon / 2) ** 2;

  const safeA = Math.min(1, Math.max(0, a));
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(safeA), Math.sqrt(1 - safeA));
};

export const calculateDistanceDeliveryFee = (distanceKm: number): number => {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error("Invalid delivery distance.");
  }

  if (distanceKm <= 5) return 40;
  return 40 + Math.ceil(distanceKm - 5) * 10;
};

/**
 * Fetch chef profiles from the existing customer-facing endpoint and resolve
 * coordinates by Chef document ID, linked User ID, or exact chef name.
 */
export const getChefCoordinates = async (
  api: any,
  chefId?: string | null,
  chefName?: string | null
): Promise<Coordinates> => {
  const response = await api.get("/api/chefs");
  const chefs: any[] = Array.isArray(response?.data?.chefs)
    ? response.data.chefs
    : [];

  const normalizedId = String(chefId || "").trim();
  const normalizedName = String(chefName || "").trim().toLowerCase();

  const chef = chefs.find((item: any) => {
    const idMatches =
      normalizedId &&
      (String(item?._id || "") === normalizedId ||
        String(item?.id || "") === normalizedId ||
        String(item?.user || "") === normalizedId);
    const nameMatches =
      normalizedName &&
      String(item?.name || "").trim().toLowerCase() === normalizedName;
    return Boolean(idMatches || nameMatches);
  });

  const coordinates = chef?.geoLocation?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error("This chef has not saved a valid kitchen location yet.");
  }

  // GeoJSON is [longitude, latitude].
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);

  if (!isValidDeliveryCoordinates(latitude, longitude)) {
    throw new Error("This chef has not saved a valid kitchen location yet.");
  }

  return { latitude, longitude };
};

export const calculateDeliveryQuote = async (
  api: any,
  chefId: string | null | undefined,
  chefName: string | null | undefined,
  customerLatitude: unknown,
  customerLongitude: unknown
): Promise<DeliveryQuote> => {
  if (!isValidDeliveryCoordinates(customerLatitude, customerLongitude)) {
    throw new Error("Please select a delivery address with a valid map location.");
  }

  const chef = await getChefCoordinates(api, chefId, chefName);
  const distanceKm = calculateHaversineDistanceKm(
    {
      latitude: Number(customerLatitude),
      longitude: Number(customerLongitude),
    },
    chef
  );

  return {
    distanceKm: Number(distanceKm.toFixed(3)),
    distanceDeliveryFee: calculateDistanceDeliveryFee(distanceKm),
  };
};
