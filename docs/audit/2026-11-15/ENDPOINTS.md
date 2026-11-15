# Endpoints e permissões — inventário estático

Extraído por AST; guards internos e integrações externas exigem revisão adicional. `require()` permite apenas administrador; `require("caixa")` também admite admin. `current_user` exige sessão, mas não limita perfil.

| Método | Caminho | Guard direto | Handler | Origem |
|---|---|---|---|---|
| GET | /api/auth/profiles | Sem Depends direto; revisar corpo | profiles | backend/routers/auth.py:19 |
| POST | /api/auth/first-access | Sem Depends direto; revisar corpo | first_access | backend/routers/auth.py:29 |
| POST | /api/auth/first-password | Depends(current_user) | first_password | backend/routers/auth.py:57 |
| POST | /api/auth/login | Sem Depends direto; revisar corpo | login | backend/routers/auth.py:69 |
| POST | /api/auth/logout | Sem Depends direto; revisar corpo | logout | backend/routers/auth.py:97 |
| GET | /api/auth/me | Depends(current_user) | me | backend/routers/auth.py:104 |
| GET | /api/employees | Depends(require()) | list_employees | backend/routers/auth.py:115 |
| POST | /api/employees | Depends(require()) | create_employee | backend/routers/auth.py:120 |
| PUT | /api/employees/{id} | Depends(require()) | update_employee | backend/routers/auth.py:139 |
| DELETE | /api/employees/{id} | Depends(require()) | delete_employee | backend/routers/auth.py:172 |
| GET | /api/employees/time-clock/me | Depends(current_user) | my_time_clock | backend/routers/auth.py:190 |
| POST | /api/employees/time-clock/in | Depends(current_user) | clock_in | backend/routers/auth.py:196 |
| POST | /api/employees/time-clock/out | Depends(current_user) | clock_out | backend/routers/auth.py:207 |
| GET | /api/employees/time-clock/report | Depends(require()) | time_clock_report | backend/routers/auth.py:225 |
| GET | /api/categories | Depends(current_user) | list_categories | backend/routers/catalog.py:33 |
| POST | /api/categories | Depends(require()) | create_category | backend/routers/catalog.py:38 |
| PUT | /api/categories/{id} | Depends(require()) | update_category | backend/routers/catalog.py:46 |
| DELETE | /api/categories/{id} | Depends(require()) | delete_category | backend/routers/catalog.py:55 |
| GET | /api/products | Depends(current_user) | list_products | backend/routers/catalog.py:64 |
| POST | /api/products | Depends(require()) | create_product | backend/routers/catalog.py:82 |
| PUT | /api/products/{id} | Depends(require()) | update_product | backend/routers/catalog.py:91 |
| DELETE | /api/products/{id} | Depends(require()) | delete_product | backend/routers/catalog.py:100 |
| POST | /api/products/bulk-delete | Depends(require()) | bulk_delete_products | backend/routers/catalog.py:108 |
| GET | /api/suppliers | Depends(require('caixa')) | list_suppliers | backend/routers/catalog.py:115 |
| POST | /api/suppliers | Depends(require()) | create_supplier | backend/routers/catalog.py:120 |
| PUT | /api/suppliers/{id} | Depends(require()) | update_supplier | backend/routers/catalog.py:127 |
| DELETE | /api/suppliers/{id} | Depends(require()) | delete_supplier | backend/routers/catalog.py:135 |
| GET | /api/purchases | Depends(require('caixa')) | list_purchases | backend/routers/catalog.py:143 |
| POST | /api/purchases | Depends(require('caixa')) | register_purchase | backend/routers/catalog.py:148 |
| GET | /api/purchases/expiry | Depends(require('caixa')) | purchase_expiry | backend/routers/catalog.py:185 |
| GET | /api/inventory/lots | Depends(require('caixa')) | inventory_lots | backend/routers/catalog.py:201 |
| POST | /api/inventory/lots/count | Depends(require('caixa')) | count_purchase_lot | backend/routers/catalog.py:207 |
| GET | /api/inventory/lots/trace | Depends(require('caixa')) | lot_trace | backend/routers/catalog.py:229 |
| GET | /api/inventory/counts | Depends(require('caixa')) | inventory_counts | backend/routers/catalog.py:236 |
| POST | /api/inventory/counts | Depends(require('caixa')) | register_inventory_count | backend/routers/catalog.py:241 |
| GET | /api/ingredients | Depends(current_user) | list_ingredients | backend/routers/catalog.py:260 |
| POST | /api/ingredients | Depends(require()) | create_ingredient | backend/routers/catalog.py:265 |
| PUT | /api/ingredients/{id} | Depends(require()) | update_ingredient | backend/routers/catalog.py:272 |
| DELETE | /api/ingredients/{id} | Depends(require()) | delete_ingredient | backend/routers/catalog.py:281 |
| GET | /api/production/batches | Depends(require('caixa', 'cozinha')) | production_batches | backend/routers/catalog.py:289 |
| POST | /api/production/batches | Depends(require('caixa', 'cozinha')) | create_production_batch | backend/routers/catalog.py:294 |
| GET | /api/stock/moves | Depends(require('caixa', 'cozinha')) | list_moves | backend/routers/catalog.py:321 |
| POST | /api/stock/moves | Depends(require('caixa', 'cozinha')) | create_move | backend/routers/catalog.py:326 |
| GET | /api/printers | Depends(current_user) | list_printers | backend/routers/config.py:21 |
| POST | /api/printers | Depends(require()) | create_printer | backend/routers/config.py:26 |
| PUT | /api/printers/{id} | Depends(require()) | update_printer | backend/routers/config.py:33 |
| DELETE | /api/printers/{id} | Depends(require()) | delete_printer | backend/routers/config.py:41 |
| GET | /api/branding | Sem Depends direto; revisar corpo | public_branding | backend/routers/config.py:48 |
| GET | /api/settings/general | Depends(current_user) | get_general | backend/routers/config.py:55 |
| PUT | /api/settings/general | Depends(require()) | put_general | backend/routers/config.py:60 |
| GET | /api/backup | Depends(require()) | backup | backend/routers/config.py:84 |
| POST | /api/backup/restore | Depends(require()) | restore | backend/routers/config.py:104 |
| GET | /api/drive/status | Depends(require()) | drive_status | backend/routers/drive.py:49 |
| GET | /api/drive/connect | Depends(require()) | drive_connect | backend/routers/drive.py:57 |
| GET | /api/drive/callback | Sem Depends direto; revisar corpo | drive_callback | backend/routers/drive.py:70 |
| PUT | /api/drive/settings | Depends(require()) | drive_settings | backend/routers/drive.py:103 |
| DELETE | /api/drive | Depends(require()) | drive_disconnect | backend/routers/drive.py:109 |
| POST | /api/drive/backup-now | Depends(require()) | drive_backup_now | backend/routers/drive.py:172 |
| POST | /api/cron/nightly-backup | Sem Depends direto; revisar corpo | cron_nightly_backup | backend/routers/drive.py:193 |
| GET | /api/customers | Depends(require('caixa', 'garcom')) | list_customers | backend/routers/fiado.py:19 |
| POST | /api/customers | Depends(require('caixa')) | create_customer | backend/routers/fiado.py:24 |
| PUT | /api/customers/{id} | Depends(require('caixa')) | update_customer | backend/routers/fiado.py:31 |
| DELETE | /api/customers/{id} | Depends(require('caixa')) | delete_customer | backend/routers/fiado.py:38 |
| GET | /api/customers/{id}/moves | Depends(require('caixa')) | customer_moves | backend/routers/fiado.py:48 |
| POST | /api/customers/{id}/receive | Depends(require('caixa')) | receive | backend/routers/fiado.py:54 |
| GET | /api/payment-methods | Depends(current_user) | list_methods | backend/routers/finance.py:39 |
| POST | /api/payment-methods | Depends(require()) | create_method | backend/routers/finance.py:44 |
| PUT | /api/payment-methods/{id} | Depends(require()) | update_method | backend/routers/finance.py:54 |
| DELETE | /api/payment-methods/{id} | Depends(require()) | delete_method | backend/routers/finance.py:67 |
| GET | /api/account-categories | Depends(require('caixa')) | list_cats | backend/routers/finance.py:79 |
| POST | /api/account-categories | Depends(require()) | create_cat | backend/routers/finance.py:84 |
| PUT | /api/account-categories/{id} | Depends(require()) | update_cat | backend/routers/finance.py:93 |
| DELETE | /api/account-categories/{id} | Depends(require()) | delete_cat | backend/routers/finance.py:102 |
| GET | /api/bills | Depends(require('caixa')) | list_bills | backend/routers/finance.py:119 |
| GET | /api/bills/summary | Depends(require('caixa')) | bills_summary | backend/routers/finance.py:130 |
| GET | /api/bills/alerts | Depends(require('caixa')) | bills_alerts | backend/routers/finance.py:144 |
| POST | /api/bills | Depends(require()) | create_bill | backend/routers/finance.py:165 |
| PUT | /api/bills/{id} | Depends(require()) | update_bill | backend/routers/finance.py:178 |
| POST | /api/bills/{id}/pay | Depends(require('caixa')) | pay_bill | backend/routers/finance.py:189 |
| POST | /api/bills/{id}/reopen | Depends(require()) | reopen_bill | backend/routers/finance.py:199 |
| POST | /api/bills/{id}/cancel | Depends(require()) | cancel_bill | backend/routers/finance.py:209 |
| DELETE | /api/bills/{id} | Depends(require()) | delete_bill | backend/routers/finance.py:217 |
| POST | /api/pdv/sale | Depends(require('caixa')) | quick_sale | backend/routers/operations.py:21 |
| GET | /api/orders | Depends(require('caixa')) | list_orders | backend/routers/operations.py:46 |
| POST | /api/orders/{id}/cancel | Depends(current_user) | cancel_order | backend/routers/operations.py:57 |
| POST | /api/orders/{id}/items/{item_id}/refund | Depends(current_user) | refund_item | backend/routers/operations.py:81 |
| GET | /api/invoices | Depends(require('caixa')) | list_invoices | backend/routers/operations.py:124 |
| GET | /api/invoices/{id} | Depends(require('caixa')) | get_invoice | backend/routers/operations.py:129 |
| POST | /api/orders/{id}/invoice | Depends(require('caixa')) | emit_for_order | backend/routers/operations.py:137 |
| GET | /api/kds/tickets | Depends(current_user) | kds_tickets | backend/routers/operations.py:148 |
| PATCH | /api/kds/tickets/{id} | Depends(require('cozinha', 'garcom', 'caixa')) | kds_update | backend/routers/operations.py:163 |
| GET | /api/delivery/orders | Depends(require('caixa')) | delivery_orders | backend/routers/operations.py:192 |
| POST | /api/delivery/simulate | Depends(require('caixa')) | simulate | backend/routers/operations.py:200 |
| PATCH | /api/delivery/orders/{id}/status | Depends(require('caixa')) | delivery_status | backend/routers/operations.py:226 |
| GET | /api/cash/current | Depends(require('caixa')) | cash_current | backend/routers/operations.py:269 |
| GET | /api/cash/history | Depends(require('caixa')) | cash_history | backend/routers/operations.py:275 |
| POST | /api/cash/open | Depends(require('caixa')) | cash_open | backend/routers/operations.py:280 |
| POST | /api/cash/movement | Depends(require('caixa')) | cash_move | backend/routers/operations.py:292 |
| POST | /api/cash/close | Depends(require('caixa')) | cash_close | backend/routers/operations.py:308 |
| GET | /api/environments | Depends(current_user) | list_envs | backend/routers/production.py:34 |
| POST | /api/environments | Depends(require()) | create_env | backend/routers/production.py:39 |
| PUT | /api/environments/{id} | Depends(require()) | update_env | backend/routers/production.py:49 |
| DELETE | /api/environments/{id} | Depends(require()) | delete_env | backend/routers/production.py:57 |
| GET | /api/print/queue | Depends(current_user) | print_queue | backend/routers/production.py:68 |
| GET | /api/print/recent | Depends(current_user) | print_recent | backend/routers/production.py:84 |
| POST | /api/kds/tickets/{id}/printed | Depends(current_user) | mark_printed | backend/routers/production.py:89 |
| GET | /api/menu | Sem Depends direto; revisar corpo | menu | backend/routers/public.py:22 |
| GET | /api/tables/{id} | Sem Depends direto; revisar corpo | public_table | backend/routers/public.py:31 |
| GET | /api/tables/{id}/preparo | Sem Depends direto; revisar corpo | public_table_preparation | backend/routers/public.py:42 |
| POST | /api/tables/{id}/split-request | Sem Depends direto; revisar corpo | request_table_split | backend/routers/public.py:67 |
| POST | /api/tables/{id}/order | Sem Depends direto; revisar corpo | public_table_order | backend/routers/public.py:95 |
| POST | /api/tables/{id}/call | Sem Depends direto; revisar corpo | public_call | backend/routers/public.py:111 |
| POST | /api/delivery | Sem Depends direto; revisar corpo | public_delivery | backend/routers/public.py:118 |
| GET | /api/delivery/{id} | Sem Depends direto; revisar corpo | public_delivery_status | backend/routers/public.py:149 |
| GET | /api/reports/dashboard | Depends(require('caixa')) | dashboard | backend/routers/reports.py:44 |
| GET | /api/reports/executive | Depends(require()) | executive_report | backend/routers/reports.py:104 |
| GET | /api/reports/dre | Depends(require()) | dre | backend/routers/reports.py:123 |
| GET | /api/reports/cashflow | Depends(require('caixa')) | cashflow | backend/routers/reports.py:227 |
| GET | /api/reports/employee-performance | Depends(require()) | employee_performance | backend/routers/reports.py:266 |
| GET | /api/reports/intelligent-insights | Depends(require()) | intelligent_insights | backend/routers/reports.py:332 |
| GET | /api/reports/sales-stock-forecast | Depends(require()) | sales_stock_forecast | backend/routers/reports.py:398 |
| GET | /api/reports/sales-trends | Depends(require()) | sales_trends | backend/routers/reports.py:465 |
| GET | /api/reports/forecast | Depends(require()) | financial_forecast | backend/routers/reports.py:488 |
| GET | /api/reports/sales-intelligence | Depends(require()) | sales_intelligence | backend/routers/reports.py:544 |
| GET | /api/reports/product-profit | Depends(require()) | product_profit | backend/routers/reports.py:576 |
| GET | /api/reports/options | Depends(require()) | option_ranking | backend/routers/reports.py:617 |
| GET | /api/settings/card-fees | Depends(require('caixa')) | get_card_fees | backend/routers/reports.py:637 |
| PUT | /api/settings/card-fees | Depends(require()) | put_card_fees | backend/routers/reports.py:642 |
| GET | /api/expenses | Depends(require()) | list_expenses | backend/routers/reports.py:650 |
| POST | /api/expenses | Depends(require()) | create_expense | backend/routers/reports.py:655 |
| DELETE | /api/expenses/{id} | Depends(require()) | delete_expense | backend/routers/reports.py:662 |
| GET | /api/backups/server | Depends(require()) | list_server_backups | backend/routers/serverbackup.py:41 |
| POST | /api/backups/server | Depends(require()) | backup_now | backend/routers/serverbackup.py:46 |
| GET | /api/backups/server/settings | Depends(require()) | get_local_settings | backend/routers/serverbackup.py:51 |
| PUT | /api/backups/server/settings | Depends(require()) | put_local_settings | backend/routers/serverbackup.py:56 |
| GET | /api/backups/server/{id}/download | Depends(require()) | download_backup | backend/routers/serverbackup.py:69 |
| POST | /api/backups/server/{id}/restore | Depends(require()) | restore_backup | backend/routers/serverbackup.py:76 |
| DELETE | /api/backups/server/{id} | Depends(require()) | delete_backup | backend/routers/serverbackup.py:84 |
| POST | /api/selftest | Depends(require()) | run_selftest | backend/routers/system.py:153 |
| GET | /api/selftest/last | Depends(require()) | last_selftest | backend/routers/system.py:163 |
| GET | /api/tables | Depends(current_user) | list_tables | backend/routers/tables.py:38 |
| POST | /api/tables | Depends(require('caixa')) | create_table | backend/routers/tables.py:43 |
| PUT | /api/tables/{id} | Depends(require(*STAFF)) | update_table | backend/routers/tables.py:52 |
| DELETE | /api/tables/{id} | Depends(require('caixa')) | delete_table | backend/routers/tables.py:61 |
| POST | /api/tables/{id}/open | Depends(require(*STAFF)) | open_table | backend/routers/tables.py:70 |
| PUT | /api/tables/{id}/customers | Depends(require(*STAFF)) | set_table_customers | backend/routers/tables.py:84 |
| PATCH | /api/tables/{id}/status | Depends(require(*STAFF)) | set_table_status | backend/routers/tables.py:101 |
| POST | /api/tables/{id}/release | Depends(require(*STAFF)) | release_table | backend/routers/tables.py:117 |
| POST | /api/tables/{id}/cancel | Depends(current_user) | cancel_table | backend/routers/tables.py:133 |
| POST | /api/tables/{id}/clear-call | Depends(require(*STAFF)) | clear_call | backend/routers/tables.py:145 |
| GET | /api/tables/{id}/order | Depends(current_user) | table_order | backend/routers/tables.py:152 |
| POST | /api/tables/{id}/items | Depends(require(*STAFF)) | add_items | backend/routers/tables.py:160 |
| POST | /api/tables/{id}/items/{item_id}/cancel | Depends(current_user) | cancel_item | backend/routers/tables.py:183 |
| POST | /api/tables/{id}/transfer | Depends(require(*STAFF)) | transfer | backend/routers/tables.py:207 |
| GET | /api/tables/split-requests/pending | Depends(require('caixa')) | pending_split_requests | backend/routers/tables.py:224 |
| GET | /api/tables/{id}/split-request | Depends(require('caixa')) | cashier_split_request | backend/routers/tables.py:240 |
| DELETE | /api/tables/{id}/split-request | Depends(require('caixa')) | clear_split_request | backend/routers/tables.py:249 |
| POST | /api/tables/{id}/partial-bill/preview | Depends(require('caixa')) | preview_partial_bill | backend/routers/tables.py:261 |
| POST | /api/tables/{id}/partial-bill/pay | Depends(require('caixa')) | pay_partial_bill | backend/routers/tables.py:293 |
| POST | /api/tables/{id}/pay | Depends(require('caixa')) | pay_table | backend/routers/tables.py:380 |
