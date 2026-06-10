-- Migration: auto-generate category_code for employee_category_master from category_name

CREATE OR REPLACE FUNCTION generate_category_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  name_text text;
  code text;
  counter int := 1;
BEGIN
  name_text := coalesce(NEW.category_name, 'CAT');
  code := upper(left(regexp_replace(name_text, '[^A-Z]+', '', 'g'), 3));

  IF code = '' THEN
    code := 'CAT';
  ELSIF length(code) < 3 THEN
    code := rpad(code, 3, 'X');
  END IF;

  WHILE EXISTS (SELECT 1 FROM employee_category_master WHERE category_code = code) LOOP
    code := left(code, GREATEST(3 - length(counter::text), 1)) || counter;
    counter := counter + 1;
  END LOOP;

  NEW.category_code := code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_category_code_trg ON employee_category_master;

CREATE TRIGGER employee_category_code_trg
BEFORE INSERT ON employee_category_master
FOR EACH ROW
EXECUTE FUNCTION generate_category_code();
