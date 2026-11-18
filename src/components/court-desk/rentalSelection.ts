export type RentalCustomer = {
  customerAccountId?: string | null;
  customerName?: string | null;
};

const normalizedName = (name?: string | null) =>
  (name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

/** Every selected rental must match the new rental by a real account or customer name. */
export function canCombineRentals(selected: RentalCustomer[], next: RentalCustomer): boolean {
  const name = normalizedName(next.customerName);
  return selected.every(row =>
    (!!next.customerAccountId && row.customerAccountId === next.customerAccountId) ||
    (!!name && normalizedName(row.customerName) === name)
  );
}
