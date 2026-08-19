const Airtable = require('airtable');
const axios = require('axios');

// ========================================
// CONFIGURACIÓN
// ========================================
const airtable = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
});
const base = airtable.base(process.env.AIRTABLE_BASE_ID);

const TENANT_TURNER_API_KEY = process.env.TENANT_TURNER_API_KEY;
const TENANT_TURNER_API_URL = 'https://api.tenantturner.com/v1/properties';

// ========================================
// MAPEO DE CAMPOS
// ========================================
function mapPropertyData(record) {
    const fields = record.fields;
    
    const propertyTypeMap = {
        'Apartamento': 'Apartment',
        'Casa': 'House',
        'Condo': 'Condo',
        'Estudio': 'Studio',
        'Duplex': 'Duplex'
    };

    const leaseTermMap = {
        '6 meses': '6 Months',
        '12 meses': '12 Months',
        '24 meses': '24 Months',
        'Mes a mes': 'Month to Month'
    };

    const laundryMap = {
        'In-unit': 'In Unit',
        'En el edificio': 'On Site',
        'Comunitaria': 'Community',
        'Sin lavandería': 'None'
    };

    const amenityMap = {
        'Piscina': 'Pool',
        'Gimnasio': 'Gym',
        'Seguridad 24h': '24 Hour Security',
        'Estacionamiento': 'Parking',
        'Ascensor': 'Elevator',
        'Balcón': 'Balcony',
        'Aire acondicionado': 'Air Conditioning',
        'Calefacción': 'Heating',
        'Lavandería': 'Laundry',
        'Mascotas permitidas': 'Pets Allowed',
        'Amueblado': 'Furnished',
        'Acceso discapacitados': 'Wheelchair Access',
        'Área de juegos': 'Playground',
        'Jacuzzi': 'Jacuzzi',
        'Sauna': 'Sauna'
    };

    const utilityMap = {
        'Agua': 'Water',
        'Electricidad': 'Electricity',
        'Gas': 'Gas',
        'Internet': 'Internet',
        'Cable': 'Cable',
        'Recolección de basura': 'Trash',
        'Mantenimiento de áreas comunes': 'Common Area Maintenance'
    };

    return {
        address: fields.Address || '',
        city: fields.City || '',
        state: fields.State || '',
        zipCode: fields.Zip ? String(fields.Zip).padStart(5, '0') : '00000',
        propertyType: propertyTypeMap[fields['Rental Type']] || 'Apartment',
        description: fields.Description || '',
        
        photos: fields['Upload photos'] ? fields['Upload photos'].map(img => ({
            url: img.url,
            isPrimary: false
        })) : [{ url: 'https://via.placeholder.com/800x600?text=No+Image', isPrimary: true }],
        
        propertyFeatures: {
            parking: fields.Parking || 'None',
            parkingSpots: parseInt(fields.Spot) || 0,
            cooling: fields['Cooling system'] || '',
            heating: fields['Heater system'] || '',
            laundry: laundryMap[fields.Laundry] || 'None'
        },
        
        propertyAmenities: fields.Amenities ? fields.Amenities.map(a => amenityMap[a] || a).filter(Boolean) : [],
        
        owners: [
            {
                name: fields['Owner Name'] || 'Propietario Principal',
                email: fields['Owner Email'] || 'owner@example.com',
                phone: fields['Owner Phone'] ? `1${fields['Owner Phone'].replace(/\D/g, '')}` : '13055551234'
            }
        ],
        
        occupants: [
            {
                name: 'Sin ocupantes',
                email: 'none@example.com',
                phone: '13055550000'
            }
        ],
        
        address2: fields.Unit ? `#${fields.Unit}` : '',
        descriptionTitle: fields['Description Title'] || '',
        bedrooms: parseInt(fields.Beds) || 0,
        bathrooms: parseFloat(fields.Bathrooms) || 0,
        squareFeet: parseInt(fields['Square Fee']) || 850,
        rentAmount: parseFloat(fields.Price) || 0,
        depositAmount: parseFloat(fields.Deposit) || 0,
        availableDate: fields['Date Available For Move-In'] || '',
        minimumLeaseTerm: leaseTermMap[fields['Lease Term']] || '12 Months',
        virtualTour: fields['Visual Tour'] || '',
        utilities: fields.Utilities ? fields.Utilities.map(u => utilityMap[u] || u).filter(Boolean) : []
    };
}

// ========================================
// FUNCIONES PRINCIPALES
// ========================================

async function getPropertiesFromAirtable() {
    const records = [];
    
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
}

async function createPropertyInTenantTurner(propertyData) {
    const encodedApiKey = Buffer.from(TENANT_TURNER_API_KEY).toString('base64');
    
    console.log(`🔑 Longitud de la API Key: ${TENANT_TURNER_API_KEY?.length || 0}`);
    console.log(`🔑 Primeros 5 caracteres: ${TENANT_TURNER_API_KEY?.substring(0, 5) || 'VACÍA'}`);
    console.log(`📤 Enviando a Tenant Turner: ${propertyData.address}`);
    console.log(`🌐 Usando IPv4 forzado...`);
    
    try {
        const response = await axios.post(TENANT_TURNER_API_URL, propertyData, {
            headers: {
                'Authorization': `Basic ${encodedApiKey}`,
                'Content-Type': 'application/json'
            },
            // 🔧 FORZAR IPv4 Y TIMEOUT
            family: 4,
            timeout: 30000
        });
        
        console.log(`✅ Propiedad creada exitosamente: ${propertyData.address}`);
        return response.data;
    } catch (error) {
        if (error.response) {
            console.error(`❌ Error ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            console.error(`📋 Headers enviados: ${JSON.stringify(error.config.headers)}`);
        } else {
            console.error(`❌ Error de red: ${error.message}`);
            console.error(`💡 Si el error persiste, verifica que la URL de la API sea correcta`);
        }
        throw error;
    }
}

async function markAsPublished(recordId) {
    await base('Automatic apartments').update(recordId, {
        Published: true,
        'Date Published': new Date().toISOString()
    });
    console.log(`📝 Marcado como publicado el registro ${recordId}`);
}

// ========================================
// FUNCIÓN PRINCIPAL
// ========================================

async function main() {
    console.log('🚀 Iniciando sincronización con Tenant Turner...');
    console.log(`⏰ ${new Date().toLocaleString()}`);
    
    try {
        const properties = await getPropertiesFromAirtable();
        
        if (properties.length === 0) {
            console.log('ℹ️ No hay propiedades pendientes de publicación');
            return;
        }
        
        for (const record of properties) {
            try {
                const propertyData = mapPropertyData(record);
                await createPropertyInTenantTurner(propertyData);
                await markAsPublished(record.id);
            } catch (error) {
                console.error(`❌ Falló la propiedad ${record.id}`);
            }
        }
        
        console.log('✅ Sincronización completada');
        
    } catch (error) {
        console.error('❌ Error en el proceso principal:', error.message);
        process.exit(1);
    }
}

// ========================================
// EJECUCIÓN
// ========================================

const requiredEnv = ['AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID', 'TENANT_TURNER_API_KEY'];
const missing = requiredEnv.filter(key => !process.env[key]);

if (missing.length > 0) {
    console.error(`❌ Faltan variables de entorno: ${missing.join(', ')}`);
    process.exit(1);
}

main();
