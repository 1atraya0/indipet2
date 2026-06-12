-- Flag manager-designation employees as reporting managers
update employee_master
set is_reporting_manager = true
where designation_id in (
  select designation_id from designation_master
  where designation_code in ('HRM-MGR', 'RTL-SM', 'RTL-AM', 'RTL-SAM', 'GRM-SGR', 'VET-CM')
);
