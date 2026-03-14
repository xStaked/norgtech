require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { createClient } = require('@supabase/supabase-js');

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

const seedUsers = [
  {
    email: 'admin@norgtech.demo',
    password: 'Norgtech123!',
    fullName: 'Admin Norgtech',
    role: 'admin',
  },
  {
    email: 'asesor@norgtech.demo',
    password: 'Norgtech123!',
    fullName: 'Asesor Tecnico Demo',
    role: 'asesor_tecnico',
  },
  {
    email: 'cliente@norgtech.demo',
    password: 'Norgtech123!',
    fullName: 'Cliente Demo',
    role: 'cliente',
  },
];

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function findUserByEmail(supabaseAdmin, email) {
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw error;
    }

    const user = data.users.find((candidate) => candidate.email === email);
    if (user) {
      return user;
    }

    if (data.users.length < 200) {
      return null;
    }

    page += 1;
  }
}

async function ensureAuthUser(supabaseAdmin, user) {
  const existingUser = await findUserByEmail(supabaseAdmin, user.email);
  if (existingUser) {
    return existingUser;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: {
      full_name: user.fullName,
      role: user.role,
    },
  });

  if (error || !data.user) {
    throw error || new Error(`Failed to create auth user for ${user.email}`);
  }

  return data.user;
}

async function main() {
  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const organization = await prisma.organization.upsert({
    where: { id: '5bfa6d6d-df7c-4860-9d2f-4dd4ce883e44' },
    update: {
      name: 'Norgtech Demo',
    },
    create: {
      id: '5bfa6d6d-df7c-4860-9d2f-4dd4ce883e44',
      name: 'Norgtech Demo',
    },
  });

  const organizationId = organization.id;

  const seededAuthUsers = await Promise.all(
    seedUsers.map(async (user) => ({
      definition: user,
      authUser: await ensureAuthUser(supabaseAdmin, user),
    })),
  );

  for (const entry of seededAuthUsers) {
    await prisma.profile.upsert({
      where: { id: entry.authUser.id },
      update: {
        email: entry.definition.email,
        fullName: entry.definition.fullName,
        role: entry.definition.role,
        organizationId,
      },
      create: {
        id: entry.authUser.id,
        email: entry.definition.email,
        fullName: entry.definition.fullName,
        role: entry.definition.role,
        organizationId,
      },
    });
  }

  const advisor = seededAuthUsers.find(
    (entry) => entry.definition.role === 'asesor_tecnico',
  );

  if (!advisor) {
    throw new Error('Advisor user missing after seeding');
  }

  const demoClient = await prisma.client.upsert({
    where: { id: 'fe2f0b1d-7309-4d31-8f82-fc3e7f60b530' },
    update: {
      organizationId,
      fullName: 'Granja Demo El Roble',
      phone: '+573001112233',
      email: 'cliente@norgtech.demo',
      companyName: 'Avicola El Roble SAS',
      address: 'Tunja, Boyaca',
      assignedAdvisorId: advisor.authUser.id,
      status: 'active',
      notes: 'Cliente base para pruebas internas',
    },
    create: {
      id: 'fe2f0b1d-7309-4d31-8f82-fc3e7f60b530',
      organizationId,
      fullName: 'Granja Demo El Roble',
      phone: '+573001112233',
      email: 'cliente@norgtech.demo',
      companyName: 'Avicola El Roble SAS',
      address: 'Tunja, Boyaca',
      assignedAdvisorId: advisor.authUser.id,
      status: 'active',
      notes: 'Cliente base para pruebas internas',
    },
  });

  await prisma.farm.upsert({
    where: { id: 'ba147fc5-1c19-420d-a6a7-bf3caaf8d62b' },
    update: {
      organizationId,
      clientId: demoClient.id,
      name: 'Galpon Principal',
      speciesType: 'poultry',
      location: 'Tunja, Boyaca',
      capacity: 12000,
      assignedAdvisorId: advisor.authUser.id,
    },
    create: {
      id: 'ba147fc5-1c19-420d-a6a7-bf3caaf8d62b',
      organizationId,
      clientId: demoClient.id,
      name: 'Galpon Principal',
      speciesType: 'poultry',
      location: 'Tunja, Boyaca',
      capacity: 12000,
      assignedAdvisorId: advisor.authUser.id,
    },
  });

  console.log(
    'Seed completado: organizacion, perfiles demo, cliente y granja creados/actualizados.',
  );
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
