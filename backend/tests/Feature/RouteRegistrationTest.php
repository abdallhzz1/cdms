<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\V1\UserController;
use Illuminate\Http\Request;
use Tests\TestCase;

class RouteRegistrationTest extends TestCase
{
    public function test_static_user_routes_are_not_shadowed_by_user_model_binding(): void
    {
        $routes = app('router')->getRoutes();

        $rtaRoute = $routes->match(Request::create('/api/v1/users/rta-list', 'GET'));
        $departmentRoute = $routes->match(Request::create('/api/v1/users/departments-for-assignment', 'GET'));

        $this->assertSame(UserController::class.'@rtaList', $rtaRoute->getActionName());
        $this->assertSame(UserController::class.'@departmentsForAssignment', $departmentRoute->getActionName());
    }

    public function test_api_has_no_duplicate_method_and_uri_registrations(): void
    {
        $seen = [];
        $duplicates = [];

        foreach (app('router')->getRoutes() as $route) {
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $key = $method.' '.$route->uri();
                if (isset($seen[$key])) {
                    $duplicates[] = $key;
                }
                $seen[$key] = true;
            }
        }

        $this->assertSame([], array_values(array_unique($duplicates)));
    }
}
