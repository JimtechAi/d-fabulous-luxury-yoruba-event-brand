--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: assign_booking_reference(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."assign_booking_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.booking_reference IS NULL OR btrim(NEW.booking_reference) = '' THEN
    NEW.booking_reference := 'DF-' || lpad(nextval('public.booking_reference_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_booking_reference"() OWNER TO "postgres";

--
-- Name: enforce_payment_ledger_immutability(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_payment_ledger_immutability"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT public.is_owner() THEN
    IF NEW.amount                 IS DISTINCT FROM OLD.amount
    OR NEW.currency               IS DISTINCT FROM OLD.currency
    OR NEW.status                 IS DISTINCT FROM OLD.status
    OR NEW.payment_type           IS DISTINCT FROM OLD.payment_type
    OR NEW.gateway_reference      IS DISTINCT FROM OLD.gateway_reference
    OR NEW.gateway_transaction_id IS DISTINCT FROM OLD.gateway_transaction_id
    OR NEW.booking_id             IS DISTINCT FROM OLD.booking_id
    OR NEW.paid_at                IS DISTINCT FROM OLD.paid_at
    THEN
      RAISE EXCEPTION 'Security Policy Exception: payment ledger fields are immutable. Record a correcting entry instead.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_payment_ledger_immutability"() OWNER TO "postgres";

--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'owner')
  );
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

--
-- Name: is_owner(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_owner"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'owner'
  );
END;
$$;


ALTER FUNCTION "public"."is_owner"() OWNER TO "postgres";

--
-- Name: prevent_role_escalation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."prevent_role_escalation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Detect if role column is being modified
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Only active owners can change role values
    IF NOT public.is_owner() THEN
      RAISE EXCEPTION 'Security Policy Exception: Privilege escalation denied. Only owner account can modify user roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_role_escalation"() OWNER TO "postgres";

--
-- Name: user_has_any_permission("uuid", "text"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."user_has_any_permission"("p_user_id" "uuid", "p_permission_keys" "text"[]) RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.user_id = p_user_id
      AND up.permission_key = ANY(p_permission_keys)
  );
$$;


ALTER FUNCTION "public"."user_has_any_permission"("p_user_id" "uuid", "p_permission_keys" "text"[]) OWNER TO "postgres";

--
-- Name: user_has_permission("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."user_has_permission"("p_user_id" "uuid", "p_permission_key" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.user_id = p_user_id
      AND up.permission_key = p_permission_key
  );
$$;


ALTER FUNCTION "public"."user_has_permission"("p_user_id" "uuid", "p_permission_key" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_user_id" "uuid",
    "action" "text" NOT NULL,
    "target_user_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";

--
-- Name: blocked_dates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."blocked_dates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_date" "date" NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."blocked_dates" OWNER TO "postgres";

--
-- Name: booking_reference_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE "public"."booking_reference_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."booking_reference_seq" OWNER TO "postgres";

--
-- Name: bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text",
    "email" "text",
    "phone" "text",
    "event_date" "date",
    "event_location" "text",
    "services_requested" "text"[],
    "estimated_guest_count" integer,
    "celebration_details" "text",
    "status" "text",
    "booking_amount" numeric,
    "currency" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "booking_reference" "text",
    "completed_at" timestamp with time zone,
    "archived_at" timestamp with time zone
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";

--
-- Name: gallery; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."gallery" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "image_url" "text",
    "alt_text" "text",
    "category" "text",
    "caption" "text",
    "aspect_ratio" "text",
    "is_featured" boolean,
    "display_order" integer
);


ALTER TABLE "public"."gallery" OWNER TO "postgres";

--
-- Name: messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text",
    "email" "text",
    "phone" "text",
    "subject" "text",
    "message" "text",
    "status" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."messages" OWNER TO "postgres";

--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid",
    "user_id" "uuid",
    "amount" numeric,
    "currency" "text",
    "payment_type" "text",
    "provider" "text",
    "status" "text",
    "gateway_reference" "text",
    "gateway_transaction_id" "text",
    "payment_method" "text",
    "customer_email" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payments" OWNER TO "postgres";

--
-- Name: permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "permission_key" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "role" "text",
    "is_active" boolean,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";

--
-- Name: services; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."services" (
    "id" "text" NOT NULL,
    "slug" "text",
    "title" "text",
    "yoruba_name" "text",
    "short_description" "text",
    "full_description" "text",
    "category" "text",
    "icon_name" "text",
    "is_active" boolean,
    "display_order" integer
);


ALTER TABLE "public"."services" OWNER TO "postgres";

--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."site_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb"
);


ALTER TABLE "public"."site_settings" OWNER TO "postgres";

--
-- Name: testimonials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."testimonials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quote" "text",
    "client_names" "text",
    "event_type" "text",
    "location" "text",
    "event_date" "date",
    "rating" integer,
    "is_featured" boolean,
    "is_placeholder" boolean,
    "display_order" integer
);


ALTER TABLE "public"."testimonials" OWNER TO "postgres";

--
-- Name: user_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."user_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "permission_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_permissions" OWNER TO "postgres";

--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");


--
-- Name: blocked_dates blocked_dates_event_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."blocked_dates"
    ADD CONSTRAINT "blocked_dates_event_date_key" UNIQUE ("event_date");


--
-- Name: blocked_dates blocked_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."blocked_dates"
    ADD CONSTRAINT "blocked_dates_pkey" PRIMARY KEY ("id");


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");


--
-- Name: gallery gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gallery"
    ADD CONSTRAINT "gallery_pkey" PRIMARY KEY ("id");


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");


--
-- Name: permissions permissions_permission_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_permission_key_key" UNIQUE ("permission_key");


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key");


--
-- Name: testimonials testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."testimonials"
    ADD CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id");


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id");


--
-- Name: user_permissions user_permissions_user_id_permission_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_user_id_permission_key_key" UNIQUE ("user_id", "permission_key");


--
-- Name: bookings_active_event_date_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "bookings_active_event_date_unique" ON "public"."bookings" USING "btree" ("event_date") WHERE ("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text"]));


--
-- Name: bookings_archived_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bookings_archived_at_idx" ON "public"."bookings" USING "btree" ("archived_at") WHERE ("archived_at" IS NOT NULL);


--
-- Name: bookings_booking_reference_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "bookings_booking_reference_key" ON "public"."bookings" USING "btree" ("booking_reference") WHERE ("booking_reference" IS NOT NULL);


--
-- Name: idx_audit_logs_actor_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_logs_actor_user_id" ON "public"."audit_logs" USING "btree" ("actor_user_id");


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);


--
-- Name: idx_audit_logs_target_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_audit_logs_target_user_id" ON "public"."audit_logs" USING "btree" ("target_user_id");


--
-- Name: idx_permissions_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_permissions_key" ON "public"."permissions" USING "btree" ("permission_key");


--
-- Name: idx_user_permissions_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_permissions_key" ON "public"."user_permissions" USING "btree" ("permission_key");


--
-- Name: idx_user_permissions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_permissions_user_id" ON "public"."user_permissions" USING "btree" ("user_id");


--
-- Name: bookings trg_assign_booking_reference; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_assign_booking_reference" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."assign_booking_reference"();


--
-- Name: payments trg_enforce_payment_ledger_immutability; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_payment_ledger_immutability" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_payment_ledger_immutability"();


--
-- Name: profiles trg_prevent_role_escalation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_prevent_role_escalation" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_role_escalation"();


--
-- Name: audit_logs audit_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;


--
-- Name: blocked_dates blocked_dates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."blocked_dates"
    ADD CONSTRAINT "blocked_dates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: payments payments_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_permission_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("permission_key") ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: gallery Admin write gallery; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin write gallery" ON "public"."gallery" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: services Admin write services; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin write services" ON "public"."services" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: site_settings Admin write site_settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin write site_settings" ON "public"."site_settings" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: testimonials Admin write testimonials; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin write testimonials" ON "public"."testimonials" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: blocked_dates Admins delete blocked dates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins delete blocked dates" ON "public"."blocked_dates" FOR DELETE TO "authenticated" USING ("public"."is_admin"());


--
-- Name: blocked_dates Admins insert blocked dates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins insert blocked dates" ON "public"."blocked_dates" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() AND ("created_by" = "auth"."uid"())));


--
-- Name: payments Admins insert payments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins insert payments" ON "public"."payments" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() AND ("user_id" = "auth"."uid"())));


--
-- Name: bookings Admins modify bookings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins modify bookings" ON "public"."bookings" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: blocked_dates Admins read blocked dates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins read blocked dates" ON "public"."blocked_dates" FOR SELECT TO "authenticated" USING ("public"."is_admin"());


--
-- Name: bookings Admins read bookings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins read bookings" ON "public"."bookings" FOR SELECT TO "authenticated" USING ("public"."is_admin"());


--
-- Name: messages Admins read messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins read messages" ON "public"."messages" FOR SELECT TO "authenticated" USING ("public"."is_admin"());


--
-- Name: payments Admins read payments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins read payments" ON "public"."payments" FOR SELECT TO "authenticated" USING ("public"."is_admin"());


--
-- Name: site_settings Admins read site_settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins read site_settings" ON "public"."site_settings" FOR SELECT TO "authenticated" USING ("public"."is_admin"());


--
-- Name: blocked_dates Admins update blocked dates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins update blocked dates" ON "public"."blocked_dates" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: messages Admins update messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins update messages" ON "public"."messages" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: payments Owners delete payments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners delete payments" ON "public"."payments" FOR DELETE TO "authenticated" USING ("public"."is_owner"());


--
-- Name: payments Owners update payments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owners update payments" ON "public"."payments" FOR UPDATE TO "authenticated" USING ("public"."is_owner"()) WITH CHECK ("public"."is_owner"());


--
-- Name: gallery Public read gallery; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read gallery" ON "public"."gallery" FOR SELECT USING (true);


--
-- Name: services Public read services; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read services" ON "public"."services" FOR SELECT USING (true);


--
-- Name: testimonials Public read testimonials; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read testimonials" ON "public"."testimonials" FOR SELECT USING (true);


--
-- Name: profiles Users update own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_owner"())) WITH CHECK ((("id" = "auth"."uid"()) OR "public"."is_owner"()));


--
-- Name: profiles Users view profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users view profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_admin"()));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_insert_owner_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "audit_logs_insert_owner_admin" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));


--
-- Name: audit_logs audit_logs_read_owner_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "audit_logs_read_owner_admin" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'owner'::"text")))));


--
-- Name: blocked_dates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."blocked_dates" ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;

--
-- Name: gallery; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."gallery" ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: permissions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: permissions permissions_read_owner_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "permissions_read_owner_admin" ON "public"."permissions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;

--
-- Name: site_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."site_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: testimonials; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."testimonials" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_permissions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_permissions user_permissions_manage_owner_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_permissions_manage_owner_admin" ON "public"."user_permissions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "assign_booking_reference"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."assign_booking_reference"() FROM PUBLIC;


--
-- Name: FUNCTION "enforce_payment_ledger_immutability"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."enforce_payment_ledger_immutability"() FROM PUBLIC;


--
-- Name: FUNCTION "is_admin"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";


--
-- Name: FUNCTION "is_owner"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_owner"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_owner"() TO "authenticated";


--
-- Name: FUNCTION "prevent_role_escalation"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."prevent_role_escalation"() FROM PUBLIC;


--
-- Name: FUNCTION "user_has_any_permission"("p_user_id" "uuid", "p_permission_keys" "text"[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."user_has_any_permission"("p_user_id" "uuid", "p_permission_keys" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_has_any_permission"("p_user_id" "uuid", "p_permission_keys" "text"[]) TO "service_role";


--
-- Name: FUNCTION "user_has_permission"("p_user_id" "uuid", "p_permission_key" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."user_has_permission"("p_user_id" "uuid", "p_permission_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_has_permission"("p_user_id" "uuid", "p_permission_key" "text") TO "service_role";


--
-- Name: TABLE "audit_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";


--
-- Name: TABLE "blocked_dates"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."blocked_dates" TO "authenticated";
GRANT ALL ON TABLE "public"."blocked_dates" TO "service_role";


--
-- Name: SEQUENCE "booking_reference_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,USAGE ON SEQUENCE "public"."booking_reference_seq" TO "anon";
GRANT SELECT,USAGE ON SEQUENCE "public"."booking_reference_seq" TO "authenticated";
GRANT SELECT,USAGE ON SEQUENCE "public"."booking_reference_seq" TO "service_role";


--
-- Name: TABLE "bookings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";


--
-- Name: TABLE "gallery"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."gallery" TO "anon";
GRANT ALL ON TABLE "public"."gallery" TO "authenticated";
GRANT ALL ON TABLE "public"."gallery" TO "service_role";


--
-- Name: TABLE "messages"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";


--
-- Name: TABLE "payments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";


--
-- Name: TABLE "permissions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";


--
-- Name: TABLE "profiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";


--
-- Name: TABLE "services"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";


--
-- Name: TABLE "site_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."site_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."site_settings" TO "service_role";


--
-- Name: TABLE "testimonials"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."testimonials" TO "anon";
GRANT ALL ON TABLE "public"."testimonials" TO "authenticated";
GRANT ALL ON TABLE "public"."testimonials" TO "service_role";


--
-- Name: TABLE "user_permissions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_permissions" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--


