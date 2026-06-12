create table if not exists employee_leave_balance (
  balance_id serial primary key,
  employee_id integer references employee_master(employee_id) on delete cascade,
  leave_type_id integer references leave_type_master(leave_type_id) on delete cascade,
  policy_year smallint not null default date_part('year', current_date)::smallint,
  entitled_days numeric(5,1) not null default 0,
  availed_days numeric(5,1) not null default 0,
  remaining_days numeric(5,1) generated always as (entitled_days - availed_days) stored,
  carry_forward_days numeric(5,1) not null default 0,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  unique (employee_id, leave_type_id, policy_year)
);
