/*
 * July 21 quote-payment compatibility.
 *
 * Keep the selected quote and base amount separate from payment_intents.amount:
 *   - base_amount is the quote portion selected by the customer;
 *   - amount is the gateway total after platform fee and GST;
 *   - quotation_id prevents a rejected sibling quote from being selected;
 *   - payment_option records full / minimum / custom for support and retries.
 */
ALTER TABLE payment_intents ADD COLUMN quotation_id INT NULL;
ALTER TABLE payment_intents ADD COLUMN base_amount DECIMAL(12,2) NULL;
ALTER TABLE payment_intents ADD COLUMN payment_option VARCHAR(20) NULL;
ALTER TABLE payment_intents ADD INDEX idx_pi_quotation (quotation_id);

UPDATE payment_intents
   SET base_amount = amount
 WHERE base_amount IS NULL;
