# Branches: one business, several locations (30 October 2026)

**What it is.** A business can have several locations (branches). These are shared across all branches:

- products and prices;
- customers;
- the WhatsApp number.

Each branch has its own:

- stock;
- sales and orders;
- restaurant tables and kitchen screen;
- team members, when an owner ties someone to a branch.

This is different from [several businesses](wazabolt-several-businesses.md). Those are fully separate, with their own data, WhatsApp number and plan.

## Plans and price

| Plan | Locations included | Extra branches |
|---|---|---|
| Free, Boutique, Starter | 1 | not available |
| Business | 2 | 5,000 FCFA/month each |
| Pro | 5 | 5,000 FCFA/month each |

How extra branches are bought:

1. On **Branches**, the owner enters how many extra branches they want in total.
2. This files a request, like a plan change, and the WazaBolt team gets an email ("Extra branches – business: N").
3. The team takes payment, then approves the request in **Admin → Plan requests**. The 5,000 FCFA per branch is recorded there with the payment.
4. The owner gets an email, and the extra branches can be opened.

When a business moves to a plan with fewer locations, the newest branches are **paused**. This happens on a downgrade, a lapsed plan or fewer extra branches. A paused branch:

- keeps its stock and history;
- can't record sales;
- can be reopened once there is room.

The main branch never closes. A plan without extra branches resets them to none.

Every business already has a **main branch**, existing ones included. A business that never opens a branch sees and works exactly as before.

## For owners and admins

- **Branches page** (menu → Settings → Branches):
  - name, address, city, phone and opening hours for each branch;
  - open, pause and reopen branches;
  - locations used out of the plan's allowance;
  - the extra-branch request.
- **Branch switcher**: the branch name at the top of the dashboard, under the business name. It appears once there are two open branches. It sets the branch you work in:
  - the till and new orders sell from that branch's stock;
  - restaurant tables, the floor and the kitchen screen show that branch.
- **Stock**:
  - the product page shows stock per branch;
  - **Adjust stock** asks which branch;
  - **Move stock between branches** leaves the total unchanged and is logged on both sides;
  - the product list shows the total, with your branch's stock under it;
  - stock history shows the branch.
- **Orders, sales, reports**:
  - a Branch column and a branch filter;
  - reports and CSV exports for one branch: its sales, products, customers and the expenses tagged to it. Debts, stock alerts and invoice payments stay business-wide.
- **Expenses**: can be tagged to a branch, or left for the whole business.
- **Team**: agents, viewers and kitchen staff can be tied to one branch. Owners and admins always see every branch.

## Team members tied to a branch

A member tied to a branch:

- works there only: no switcher, the header shows the branch name;
- only sees that branch's orders, bills, tables, kitchen tickets and stock history;
- can see other branches' stock, so they can send a customer there;
- can only sell there; the database refuses anything else.

## The WhatsApp assistant

With several branches, the assistant:

- knows each branch's address, phone and hours;
- answers stock questions per branch, for example "Akwa 3, Bonamoussadi 0";
- asks which branch before taking an order. Orders go to that branch and take its stock. Without a branch, the order isn't created and the assistant asks.

The instant answers that don't use AI (location, hours, stock) are left to the assistant when there are several branches, because the answer depends on the branch.

## How stock works

- `products.stock_quantity` and `product_variants.stock_quantity` stay the **total** across branches, so everything that reads stock keeps working.
- `branch_stock` holds each branch's share.
- Every stock change already updates the total. The stock trigger applies the same change to one branch and refuses it if that branch hasn't enough (`WB409`). The branch is:
  - the order's branch, for sales and returns;
  - the branch given, for adjustments;
  - otherwise the main branch, for example opening stock on a new product.
- Moving stock between branches changes only `branch_stock`.
- When the migration runs, today's stock becomes the main branch's stock. All existing orders and restaurant tables are assigned to the main branch.

## Changes

- **Migration** `20261030120000_branches.sql`:
  - tables `branches` and `branch_stock`;
  - columns:
    - `plans.included_branches` and `extra_branch_price`;
    - `subscriptions.extra_branches`;
    - `plan_change_requests.extra_branches` (kind `branches`);
    - `branch_id` on orders, restaurant tables, expenses, team members and stock movements;
  - the stock trigger;
  - functions:
    - `transfer_stock`, `set_member_branch`, `request_extra_branches`, `branch_allowance`;
    - `adjust_stock`, `create_order`, `create_sale`, `restaurant_open_order` and `kitchen_queue` get a branch;
    - the reports `sales_by_day` and `product_sales` take a branch;
    - `approve_plan_change` handles extra branches;
  - restrictive RLS policies keep members tied to a branch to its records;
  - error codes: `WB452` (no room for another location), `WB453` (branch paused), `WB454` (the plan can't add branches).
- App:
  - `lib/branches.ts` and `lib/actions/branches.ts`;
  - the Branches page and the header switcher;
  - the products, till, orders, sales, reports, expenses, team, restaurant, billing, pricing and admin plan-request pages;
  - English and French text;
  - `config/economics.ts`: included branches and the extra-branch price per plan.
- Assistant: `lib/ai/context.ts`, `lib/ai/prompts/system-prompt.ts`, `lib/ai/tools/registry.ts` and `lib/ai/rules/index.ts`.

## Tests

- **SQL** (`supabase/tests/branches.sql`, 18 checks):
  - plan allowances (Free 1, Business 2, plus an approved extra branch);
  - stock in, counts and transfers per branch;
  - a sale takes stock from its branch and is refused when that branch has none;
  - returns go back to the order's branch;
  - combinations are counted per branch;
  - cashiers tied to a branch;
  - restaurant tables per branch;
  - reports per branch;
  - a downgrade pauses branches;
  - other businesses can't see anything.

  The full SQL suite passes (all files).
- **E2E** (`tests/e2e/branches.e2e.mjs`, 21 checks): a real owner, following the scenario above, from opening a branch to the downgrade.
- **Unit**:
  - the instant answers leave location, hours and stock to the assistant when there are several branches;
  - the business prompt lists the branches and the rule to ask which one.

## Not covered yet

- A WhatsApp number per branch: the business keeps one number.
- Receipts don't print the branch address yet.
- Some database functions that act on one order by its id (payments, refunds) check the member's role but not their branch. A member can't list other branches' orders, so they can't find their ids.
