<script setup>
    import {computed, ref} from 'vue'
    import { savedOption } from '../savedRoutes.js';


    const data = {
        'Gyeongbokgung Palace': [
            {type: 'Bus', route: 'Bus [18 mins] (10 stops) - Walk 2 mins (100m)', walking: 2, duration: 20, cost: 2800},
            {type: 'Subway', route: 'Walk 3 mins (150m) - Subway [10 mins] (6 stops) - Walk 2 mins (100m)', walking: 5, duration: 15, cost: 3800},
            {type: 'Taxi', route: 'Direct', walking: 0, duration: 10, cost: 5000},
            {type: 'Walk', route: '2 km', walking: 30, duration: 30, cost: 0}
        ],
        'Namsan Park (Outdoor)': [
            {type: 'Bus', route: 'Walk 3 mins (150m) - Bus [27 mins] (15 stops)', walking: 3, duration: 30, cost: 3500},
            {type: 'Subway', route: 'Walk 4 mins (200m) - Subway [11 mins] (8 stops) - Walk 5 mins (250m)', walking: 9, duration: 20, cost: 4500},
            {type: 'Taxi', route: 'Direct', walking: 0, duration: 15, cost: 8000},
            {type: 'Walk', route: '3 km', walking: 40, duration: 40, cost: 0}
        ],
        'Dinner Reservation (Myeongdong Kyoja)': [
            {type: 'Bus', route: 'Walk 3 mins (150m) - Bus [27 mins] (16 stops) - Walk 5 mins (250m)', walking: 8, duration: 35, cost: 4000},
            {type: 'Subway', route: 'Walk 7 mins (350m) - Subway [21 mins] (13 stops)', walking: 7, duration: 28, cost: 4800},
            {type: 'Taxi', route: 'Direct', walking: 0, duration: 20, cost: 10000},
            {type: 'Walk', route: '4 km', walking: 50, duration: 50, cost: 0}
        ],
        'Itaewon Street': [
            {type: 'Bus', route: 'Walk 4 mins (200m) - Bus [14 mins] (8 stops) - Walk 2 mins (100m)', walking: 6, duration: 20, cost: 3100},
            {type: 'Subway', route: 'Subway [9 mins] (6 stops) - Walk 5 mins (250m)', walking: 5, duration: 14, cost: 4000},
            {type: 'Taxi', route: 'Direct', walking: 0, duration: 15, cost: 9000},
            {type: 'Walk', route: '3 km', walking: 40, duration: 40, cost: 0}
        ]
    }

    const startPoint = ref('Korean Street Food Breakfast');
    const endPoint = ref('');
    const destinations = Object.keys(data);

    const getOptions = computed(() => {
        return data[endPoint.value] || []
    });

    function formatDuration(min) {
        const hour = Math.floor(min / 60);
        const mins = min % 60;
        return hour > 0 ? `${hour} hour ${mins} mins` : `${mins} mins`
    };

    // get the saved entry for the start + destination, return undefined if none
    function currentRoute() {
        return savedOption.value.find(opt => 
            opt.start === startPoint.value &&
            opt.end === endPoint.value
        );
    };

    // find and return if the option is perviously saved or not
    function isSaved(option) {
        const route = currentRoute();
        return !!route && route.options.some(opt =>
            opt.type === option.type
        );
    };

    // add or delete saved option 
    function toggleSaved(option) {
        let route = currentRoute();

        // create the start, destination and a black option entry
        if (!route) {
            savedOption.value.push({
                start: startPoint.value,
                end: endPoint.value,
                options: []
            });
            route = currentRoute();
        } 

        // get the index position of the option
        const index = route.options.findIndex(o => 
            o.type === option.type
        )
        
        if (index === -1) {
            route.options.push({...option})     // not saved, add
        } else {
            route.options.splice(index,1)       // remove 
        }

        // if the route has no options left, remove the empty entry
        if (route.options.length === 0) {
            savedOption.value = savedOption.value.filter(s => s != route)
        }
        console.log(savedOption.value);
    };

</script>

<template>
    <div class="row">

        <!-- Starting selection -->
        <div class="col-12 col-md-5 p-2">
            <h4>Starting Point</h4>
            <select class="form-select" v-model="startPoint">
                <option value="Korean Street Food Breakfast">Korean Street Food Breakfast</option>
                <option value="Gyeongbokgung Palace">Gyeongbokgung Palace</option>
                <option value="Namsan Park (Outdoor)">Namsan Park (Outdoor)</option>
                <option value="Dinner Reservation (Myeongdong Kyoja)">Dinner Reservation (Myeongdong Kyoja)</option>
            </select>
        </div>

        <!-- destination selection -->
        <div class="col-12 col-md-5 p-2">
            <h4>Destination</h4>
            <select class="form-select" v-model="endPoint">
                <option value="" disabled>Select destination</option>
                <option v-for="place in destinations" :key="place" :value="place">
                    {{ place }}
                </option>
            </select>
        </div>
        <div class="col-6"></div>
    </div>
    <hr>
    <!-- transport information -->
    <div class="card p-3 mb-3">
        <table class="table table-hover">

            <!-- header -->
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Route</th>
                    <th>Duration</th>
                    <th>Cost</th>
                    <th></th>
                </tr>
            </thead>
            <!-- available options -->
            <tbody>
                <tr v-if="!getOptions.length">
                    <td colspan="5" class="text-center text-muted py-3">Select a destination to see travel options.</td>
                </tr>
                <tr v-for="opt in getOptions" :key="opt.type">
                    <td>{{ opt.type }}</td>
                    <td>{{ opt.route }}</td>
                    <td>{{ formatDuration(opt.duration) }}</td>
                    <td>{{ opt.cost === 0 ? 'Free' : '₩' + opt.cost.toLocaleString() }}</td>
                    <td class="text-center">
                        <button type="button"class="btn btn-sm" :class="isSaved(opt) ? 'btn-outline-danger' : 'btn-outline-primary'" 
                        @click="toggleSaved(opt)">
                            {{ isSaved(opt) ? 'Unsaved' : 'Save' }}
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>
