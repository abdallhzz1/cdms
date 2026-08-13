<?php

namespace App\Http\Controllers;

/**
 * Base controller. Intentionally empty — CDMS controllers stay thin and
 * delegate business logic to the Application/Domain layers (ARCHITECTURE.md
 * §2), so no shared behaviour belongs here yet. Future modules may add
 * shared traits (e.g. authorizes-resource helpers) once RBAC exists.
 */
abstract class Controller
{
    //
}
