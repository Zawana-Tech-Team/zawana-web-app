/** Only new staff operational requests use these codes; historical text is retained. */
export const operationalReasons = ['EVENT', 'MAINTENANCE'] as const;
export const operationalReasonLabel = (value: string) => value === 'EVENT' ? 'Event' : value === 'MAINTENANCE' ? 'Maintenance' : value;
