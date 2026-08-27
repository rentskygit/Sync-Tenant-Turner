const Airtable = require('airtable');
const axios = require('axios');

const airtable = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
});
const base = airtable.base(process.env.AIRTABLE_BASE_ID);

const TENANT_TURNER_API_KEY = process.env.TENANT_TURNER_API_KEY;
const TENANT_TURNER_API_URL = 'https://api.tenantturner.com/v1/properties';

function mapPropertyData(record) {
    const fields = record.fields;
    
    // ==========================================
    // PROCESAMIENTO DE CAMPOS NUMÉRICOS
    // ==========================================
    let squareFootage = parseInt(fields['Square Fee']);
    if (squareFootage < 100) squareFootage = 100;
    if (squareFootage > 20000) squareFootage = 20000;
    
    let rentAmount = parseFloat(fields.Price);
    rentAmount = Math.round(rentAmount * 100) / 100;
    if (rentAmount < 100) rentAmount = 100;
    if (rentAmount > 100000) rentAmount = 100000;
    
    let depositAmount = parseFloat(fields.Deposit) || 0;
    depositAmount = Math.round(depositAmount * 100) / 100;
    
    let parkingCount = parseInt(fields.Spot) || 0;
    
    // ==========================================
    // UTILITIES
    // ==========================================
    const utilities = fields.Utilities || [];
    const rentIncludes = {
        rentIncludesTrash: utilities.includes('trash'),
        rentIncludesWater: utilities.includes('water'),
        rentIncludesElectricity: utilities.includes('electricity'),
        rentIncludesGas: utilities.includes('gas'),
        rentIncludesCable: utilities.includes('cable'),
        rentIncludesInternet: utilities.includes('internet')
    };
    
    // ==========================================
    // AMENITIES
    // ==========================================
    const amenityMap = {
        'Fenced': 'Fenced Yard',
        'Pool': 'Swimming Pool',
        'Gym': 'Fitness Center',
        'Clubhouse': 'Club House',
        'Playground': 'Playground',
        'Tennis': 'Tennis Court',
        'Basketball': 'Basketball Court',
        'Spa': 'Spa/Hot Tub',
        'Sauna': 'Sauna',
        'Business Center': 'Business Center',
        'Conference Room': 'Conference Room',
        'Elevator': 'Elevator',
        'Handicap Access': 'Handicap Accessible',
        'Pet Park': 'Pet Park',
        'Car Wash': 'Car Wash Area',
        'Bike Racks': 'Bike Racks',
        'Storage': 'Storage Units',
        'Security': 'Security System',
        'Gated': 'Gated Community',
        'Lake': 'Lake View',
        'Golf': 'Golf Course',
        'Tennis Court': 'Tennis Court',
        'Basketball Court': 'Basketball Court',
        'Volleyball': 'Volleyball Court',
        'Soccer': 'Soccer Field',
        'Walking Trails': 'Walking Trails'
    };
    
    const propertyAmenities = fields.Amenities 
        ? fields.Amenities.map(a => amenityMap[a] || a).filter(Boolean) 
        : [];
    
    // ==========================================
    // FOTOS
    // ==========================================
    let photos = [];
    if (fields['Upload photos '] && fields['Upload photos '].length > 0) {
        photos = fields['Upload photos '].map((img, index) => ({
            url: img.url,
            order: index
        }));
    } else {
        photos = [{ url: 'https://via.placeholder.com/800x600?text=No+Image', order: 0 }];
    }
    
    // ==========================================
    // CONSTRUIR EL PAYLOAD COMPLETO
    // ==========================================
    const propertyData = {
        // ==========================================
        // INFORMACIÓN BÁSICA
        // ==========================================
        address: fields.Address || '',
        address2: fields.Unit || '',
        city: fields.City || '',
        state: fields.State || '',
        zipCode: fields.Zip ? String(fields.Zip).padStart(5, '0') : '00000',
        propertyType: fields['Rental Type'] || 'Apartment Unit',
        description: fields.Description || '',
        descriptiveTitle: fields['Description Title'] || '',
        
        // ==========================================
        // FOTOS
        // ==========================================
        photos: photos,
        
        // ==========================================
        // PROPIETARIOS Y OCUPANTES
        // ==========================================
        owners: [
            {
                email: fields['Owner Email'] || 'owner@example.com'
            }
        ],
        occupants: [
            {
                phone: fields['Phone'] || '13055550000',
                email: fields['Email'] || 'none@example.com'
            }
        ],
        assignedUserEmail: 'Cmelo@jcmrealtygroup.com',
        
        // ==========================================
        // CARACTERÍSTICAS DE LA PROPIEDAD
        // ==========================================
        propertyFeatures: {
            laundry: fields.Laundry || 'None',
            parkingType: fields.Parking || 'None',
            parkingCount: parkingCount,
            coolingSystem: fields['Cooling system'] || 'None',
            heatingSystem: fields['Heater system'] || 'None',
            ...rentIncludes
        },
        
        // ==========================================
        // AMENIDADES
        // ==========================================
        propertyAmenities: propertyAmenities,
        
        // ==========================================
        // CAMPOS NUMÉRICOS
        // ==========================================
        squareFootage: squareFootage,
        rentAmount: rentAmount,
        depositAmount: depositAmount,
        bedrooms: parseInt(fields.Beds) || 0,
        bathrooms: parseFloat(fields.Bathrooms) || 0,
        
        // ==========================================
        // FECHAS Y TÉRMINOS
        // ==========================================
        dateAvailable: fields['Date Available For Move-In'] || '',
        minimumLeaseTerm: fields['Lease Term'] || 'One Year',
        
        // ==========================================
        // TOUR VIRTUAL
        // ==========================================
        virtualTour: fields['Visual Tour'] || '',
        
        // ==========================================
        // SYNDICATION - CORREGIDO
        // ==========================================
        syndication: {
            selectAll: true,
            EnableZillowInstantTouring: fields['EnableZillowInstantTouring'] || false
        },
        
        // ==========================================
        // RESTRICTIONS - CORREGIDO: ANIDADO CORRECTAMENTE
        // ==========================================
        restrictions: {
            RequireMoveInDateWithinMaximum: fields['RestrictionMoveInDays'] || false,
            ConsiderPets: fields['AllowPets'] || false,
            MaximumNumberOfPets: parseInt(fields['MaxPets']) || 0,
            AllowCats: fields['AllowCats'] || false,
            AllowSmallDogs: fields['AllowSmallDogs'] || false,
            AllowLargeDogs: fields['AllowLargeDogs'] || false,
            requireIncomeRatio: fields['RequireIncomeRatio'] || false
        }
    };
    
    // ==========================================
    // LOG PARA DEPURACIÓN
    // ==========================================
    console.log('📋 ====== PAYLOAD CORREGIDO ======');
    console.log(`  address: ${propertyData.address}`);
    console.log(`  address2: ${propertyData.address2}`);
    console.log(`  city: ${propertyData.city}`);
    console.log(`  state: ${propertyData.state}`);
    console.log(`  zipCode: ${propertyData.zipCode}`);
    console.log(`  propertyType: ${propertyData.propertyType}`);
    console.log(`  description: ${propertyData.description.substring(0, 50)}...`);
    console.log(`  descriptiveTitle: ${propertyData.descriptiveTitle}`);
    console.log(`  assignedUserEmail: ${propertyData.assignedUserEmail}`);
    console.log(`  dateAvailable: ${propertyData.dateAvailable}`);
    console.log(`  squareFootage: ${propertyData.squareFootage}`);
    console.log(`  rentAmount: $${propertyData.rentAmount}`);
    console.log(`  depositAmount: $${propertyData.depositAmount}`);
    console.log(`  bedrooms: ${propertyData.bedrooms}`);
    console.log(`  bathrooms: ${propertyData.bathrooms}`);
    console.log(`  minimumLeaseTerm: ${propertyData.minimumLeaseTerm}`);
    console.log(`  virtualTour: ${propertyData.virtualTour || 'No disponible'}`);
    console.log('  propertyFeatures:');
    console.log(`    laundry: ${propertyData.propertyFeatures.laundry}`);
    console.log(`    parkingType: ${propertyData.propertyFeatures.parkingType}`);
    console.log(`    parkingCount: ${propertyData.propertyFeatures.parkingCount}`);
    console.log(`    coolingSystem: ${propertyData.propertyFeatures.coolingSystem}`);
    console.log(`    heatingSystem: ${propertyData.propertyFeatures.heatingSystem}`);
    console.log(`    rentIncludesTrash: ${propertyData.propertyFeatures.rentIncludesTrash}`);
    console.log(`    rentIncludesWater: ${propertyData.propertyFeatures.rentIncludesWater}`);
    console.log(`    rentIncludesElectricity: ${propertyData.propertyFeatures.rentIncludesElectricity}`);
    console.log(`    rentIncludesGas: ${propertyData.propertyFeatures.rentIncludesGas}`);
    console.log(`    rentIncludesCable: ${propertyData.propertyFeatures.rentIncludesCable}`);
    console.log(`    rentIncludesInternet: ${propertyData.propertyFeatures.rentIncludesInternet}`);
    console.log(`  propertyAmenities: [${propertyData.propertyAmenities.join(', ') || 'Ninguna'}]`);
    console.log('  syndication:');
    console.log(`    selectAll: ${propertyData.syndication.selectAll}`);
    console.log(`    zillowInstantTours: ${propertyData.syndication.EnableZillowInstantTouring}`);
    console.log('  restrictions:');
    console.log(`    RequireMoveInDateWithinMaximum: ${propertyData.restrictions.RequireMoveInDateWithinMaximum}`);
    console.log(`    ConsiderPets: ${propertyData.restrictions.ConsiderPets}`);
    console.log(`    MaximumNumberOfPets: ${propertyData.restrictions.MaximumNumberOfPets}`);
    console.log(`    AllowCats: ${propertyData.restrictions.AllowCats}`);
    console.log(`    AllowSmallDogs: ${propertyData.restrictions.AllowSmallDogs}`);
    console.log(`    AllowLargeDogs: ${propertyData.restrictions.AllowLargeDogs}`);
    console.log(`    requireIncomeRatio: ${propertyData.restrictions.requireIncomeRatio}`);
    console.log('  photos:');
    propertyData.photos.forEach((photo, index) => {
        console.log(`    [${index}] ${photo.url}`);
    });
    console.log('===============================================');
    
    return propertyData;
}

async function getPropertiesFromAirtable() {
    const records = [];
    
    try {
        await base('Automatic apartments')
            .select({
                filterByFormula: `{Published} = FALSE()`,
                maxRecords: 10
            })
            .eachPage((pageRecords, fetchNextPage) => {
                records.push(...pageRecords);
                fetchNextPage();
            });
        
        console.log(`📊 Encontradas ${records.length} propiedades para publicar`);
        return records;
    } catch (error) {
        console.error('❌ Error al obtener propiedades de Airtable:', error.message);
        throw error;
    }
}

async function createPropertyInTenantTurner(propertyData) {
    const encodedApiKey = Buffer.from(TENANT_TURNER_API_KEY).toString('base64');
    
    console.log(`📤 Enviando a Tenant Turner: ${propertyData.address}`);
    
    try {
        const response = await axios.post(TENANT_TURNER_API_URL, propertyData, {
            headers: {
                'Authorization': `Basic ${encodedApiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        console.log(`✅ Propiedad creada exitosamente: ${propertyData.address}`);
        console.log(`📋 ID en Tenant Turner: ${response.data?.id || 'N/A'}`);
        
        if (response.data) {
            console.log(`📋 URL: ${response.data?.url || 'N/A'}`);
        }
        
        return response.data;
    } catch (error) {
        if (error.response) {
            console.error(`❌ Error ${error.response.status}: ${JSON.stringify(error.response.data, null, 2)}`);
            console.error('📋 Payload que causó el error:', JSON.stringify(propertyData, null, 2));
        } else if (error.request) {
            console.error(`❌ No se recibió respuesta del servidor: ${error.message}`);
        } else {
            console.error(`❌ Error al configurar la petición: ${error.message}`);
        }
        throw error;
    }
}

async function markAsPublished(recordId) {
    try {
        await base('Automatic apartments').update(recordId, {
            'Published': true
        });
        console.log(`📝 Marcado como publicado el registro ${recordId}`);
    } catch (error) {
        console.error(`❌ Error al marcar como publicado: ${error.message}`);
    }
}

async function main() {
    console.log('🚀 Iniciando sincronización con Tenant Turner...');
    console.log(`⏰ ${new Date().toLocaleString()}`);
    console.log(`📌 API URL: ${TENANT_TURNER_API_URL}`);
    
    try {
        // Verificar variables de entorno
        const requiredEnv = ['AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID', 'TENANT_TURNER_API_KEY'];
        const missing = requiredEnv.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            console.error(`❌ Faltan variables de entorno: ${missing.join(', ')}`);
            process.exit(1);
        }
        
        // Obtener propiedades de Airtable
        const properties = await getPropertiesFromAirtable();
        
        if (properties.length === 0) {
            console.log('ℹ️ No hay propiedades pendientes de publicación');
            return;
        }
        
        // Procesar cada propiedad
        let successCount = 0;
        let failCount = 0;
        
        for (const record of properties) {
            try {
                console.log(`\n🔄 Procesando propiedad ${record.id}...`);
                const propertyData = mapPropertyData(record);
                await createPropertyInTenantTurner(propertyData);
                await markAsPublished(record.id);
                successCount++;
                console.log(`✅ Propiedad ${record.id} procesada exitosamente`);
            } catch (error) {
                failCount++;
                console.error(`❌ Falló la propiedad ${record.id}: ${error.message}`);
                // Continuar con la siguiente propiedad
            }
        }
        
        console.log('\n📊 RESUMEN:');
        console.log(`✅ Exitosas: ${successCount}`);
        console.log(`❌ Fallidas: ${failCount}`);
        console.log(`📊 Total: ${properties.length}`);
        console.log('✅ Sincronización completada');
        
    } catch (error) {
        console.error('❌ Error en el proceso principal:', error.message);
        process.exit(1);
    }
}

// ==========================================
// EJECUCIÓN DEL PROGRAMA
// ==========================================
if (require.main === module) {
    main();
}

module.exports = {
    mapPropertyData,
    getPropertiesFromAirtable,
    createPropertyInTenantTurner,
    markAsPublished,
    main
};
